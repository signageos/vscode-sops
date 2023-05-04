import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as os from "os";
import * as child_process from "child_process";
import * as YAML from "yaml";
import * as INI from "ini";
import * as DotEnv from "./dotenv";
import * as path from "path";
import * as crypto from "crypto";
import * as minimatch from "minimatch";
import * as Debug from "debug";
import { TextEncoder, TextDecoder } from "text-encoding";

const DEBUG_NAMESPACE = "@signageos/vscode-sops";
function enableDebug() {
  const outputChannel = vscode.window.createOutputChannel(DEBUG_NAMESPACE);
  (Debug as any).log = (...args: any[]) => outputChannel.appendLine(args.join(", "));
  Debug.enable(DEBUG_NAMESPACE);
}
enableDebug(); // Uncomment this line to show debug logs in output

const debug = Debug(DEBUG_NAMESPACE);

const convertUtf8ToUint8Array = (input: string) => new TextEncoder("utf-8").encode(input);
const convertUint8ArrayToUtf8 = (input: Uint8Array) => new TextDecoder("utf-8").decode(input);

const FAKE_DECRYPTED_EDITOR_SHELL = `#!/bin/sh
cat $VSCODE_SOPS_DECRYPTED_FILE_PATH > $1
`;
const FAKE_DECRYPTED_EDITOR_CMD = `
copy %VSCODE_SOPS_DECRYPTED_FILE_PATH% %1
`;

const CONFIG_BASE_SECTION = "sops";
enum ConfigName {
  enabled = "enabled",
  beta = "beta",
  creationEnabled = "creationEnabled",
  binPath = "binPath",
  defaultAwsProfile = "defaults.awsProfile",
  defaultGcpCredentialsPath = "defaults.gcpCredentialsPath",
  defaultAgeKeyFile = "defaults.ageKeyFile",
  configPath = "configPath", // Run Control path
}
interface IRunControl {
  awsProfile?: string;
  gcpCredentialsPath?: string;
  ageKeyFile?: string;
}
const DEFAULT_RUN_CONTROL_FILENAME = ".sopsrc";
const GCP_CREDENTIALS_ENV_VAR_NAME = "GOOGLE_APPLICATION_CREDENTIALS";
const AGE_KEY_FILE_ENV_VAR_NAME = "SOPS_AGE_KEY_FILE";
const AWS_PROFILE_ENV_VAR_NAME = "AWS_PROFILE";

enum Command {
  INFO_COMMAND = "sops.info",
  TOGGLE_ORIGINAL_FILE = "sops.toggle_original_file",
  ENABLE_BETA = "sops.enable_beta",
  DISABLE_BETA = "sops.disable_beta",
}

const SOPS_CONFIG_FILENAME = ".sops.yaml";

const DECRYPTED_PREFIX = ".decrypted~";
const getSopsBinPath = () => {
  const sopsPath: string | undefined = vscode.workspace.getConfiguration(CONFIG_BASE_SECTION).get(ConfigName.binPath);
  return sopsPath ?? "sops";
};

// TODO wait til vscode provide proper way to get current extension name
const getCurrentExtensionName = (context: vscode.ExtensionContext): string => (context.globalState as any)._id ?? "signageos.signageos-vscode-sops";

const isCurrentlyBetaInstance = (context: vscode.ExtensionContext) => {
  const extensionName = getCurrentExtensionName(context);
  debug("extension name", extensionName);
  return extensionName.endsWith("-beta");
};

const isEnabled = (context: vscode.ExtensionContext) => {
  const enabled: boolean = vscode.workspace.getConfiguration(CONFIG_BASE_SECTION).get(ConfigName.enabled) ?? true;
  if (!enabled) {
    debug("Extension is disabled by configuration");
    return false;
  }

  // toggling between stable & beta versions of extension
  const beta: boolean = vscode.workspace.getConfiguration(CONFIG_BASE_SECTION).get(ConfigName.beta) ?? false;

  if (beta) {
    return isCurrentlyBetaInstance(context);
  } else {
    return !isCurrentlyBetaInstance(context);
  }
};
let spawnOptions: child_process.SpawnSyncOptions = {
  cwd: process.env.HOME,
};

function getToggleBarText(toggleToEncDec: "encrypted" | "decrypted" | "enc/dec" = "enc/dec") {
  return `SOPS: toggle ${toggleToEncDec} file`;
}

const toggleStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
toggleStatusBarItem.command = Command.TOGGLE_ORIGINAL_FILE;
toggleStatusBarItem.text = getToggleBarText();
toggleStatusBarItem.tooltip = "Toggle between original and decrypted file by SOPS";

type IFileFormat = "yaml" | "json" | "ini" | "dotenv" | "plaintext" | "binary";

function getSupportedFileFormat(languageId: string, fileName: string): IFileFormat | null {
  debug("getSupportedFileFormat", languageId, fileName);
  if (["yaml", "json", "ini", "dotenv", "plaintext", "binary"].includes(languageId)) {
    return languageId as IFileFormat;
  }

  const associations: { [pattern: string]: string } = vscode.workspace.getConfiguration("files").get("associations") ?? {};
  for (var pattern in associations) {
    const associationFileFormat = associations[pattern];
    debug("getSupportedFileFormat association", pattern, associationFileFormat);
    if (minimatch(path.basename(fileName), pattern) && associationFileFormat === languageId) {
      return "plaintext"; // When the file association is changed, use original file format as plaintext
    }
  }

  return null;
}

async function handleFile(document: vscode.TextDocument, fileFormat: IFileFormat) {
  debug("handleFile", document, fileFormat);

  if (!isDecryptedFile(document.uri)) {
    const fileContent = await getFileContent(document.uri);

    if (!fileContent) {
      debug("skip empty files", document.uri);
      return;
    }

    const parser = getParser(fileFormat);

    let fileData = parser(fileContent);
    debug("File content", fileData);

    if (fileData instanceof Array) {
      fileData = fileData[0];
    }

    if (isSopsEncryptedData(fileData)) {
      const progressOptions: vscode.ProgressOptions = {
        location: vscode.ProgressLocation.Notification,
      };
      await vscode.window.withProgress(progressOptions, async (progress) => {
        progress.report({ message: `Decrypting "${document.fileName}" SOPS file` });
        await ensureOpenDecryptedFile(document.uri, document.languageId as IFileFormat);
      });
    }
  }
}

function isSopsEncryptedData(fileData: ParsedObject) {
  return typeof fileData === "object" && ((typeof fileData.sops === "object" && typeof fileData.sops.version === "string") || typeof fileData.sops_version === "string");
}

async function handleSaveFile(document: vscode.TextDocument, fileFormat: IFileFormat) {
  debug("handleSaveFile", document, fileFormat);

  const decryptedUri = document.uri;
  const progressOptions: vscode.ProgressOptions = {
    location: vscode.ProgressLocation.Notification,
  };

  const encryptedUri = getEncryptedFileUri(decryptedUri);
  if (encryptedUri) {
    debug("Encrypted filename", encryptedUri.path);
    debug("Encrypted uri", encryptedUri);

    await vscode.window.withProgress(progressOptions, async (progress) => {
      progress.report({ message: `Encrypting "${encryptedUri.path}" SOPS file` });

      await overrideEncryptedFile(decryptedUri, encryptedUri, fileFormat);
    });
  } else if (vscode.workspace.getConfiguration(CONFIG_BASE_SECTION).get(ConfigName.creationEnabled)) {
    await vscode.window.withProgress(progressOptions, async (progress) => {
      progress.report({ message: `Trying encrypting new "${decryptedUri.path}" SOPS file` });

      await tryCreateEncryptedFile(decryptedUri, fileFormat);
      await handleFile(document, fileFormat);
    });
  }
}

async function overrideEncryptedFile(decryptedUri: vscode.Uri, encryptedUri: vscode.Uri, fileFormat: IFileFormat) {
  const originalFileContent = await getDecryptedFileContent(encryptedUri, fileFormat);
  const currentFileContent = await getFileContent(decryptedUri);

  debug("Comparing files", { originalFileContent, currentFileContent });

  const encryptedContentChecksum = await getChecksum(originalFileContent);
  const decryptedContentChecksum = await getChecksum(currentFileContent);

  debug("Content checksums", { encryptedContentChecksum, decryptedContentChecksum });

  if (encryptedContentChecksum !== decryptedContentChecksum) {
    debug("Updating encrypted");

    await encryptFileToFile(decryptedUri, encryptedUri, fileFormat);
  }
}

async function tryCreateEncryptedFile(decryptedUri: vscode.Uri, fileFormat: IFileFormat) {
  try {
    const encryptedContent = await getNewEncryptedFileContent(decryptedUri, fileFormat);
    const encryptedUri = decryptedUri; // overwrite current file
    await vscode.workspace.fs.writeFile(encryptedUri, convertUtf8ToUint8Array(encryptedContent));
  } catch (error: unknown) {
    if (isNoMatchingRulesError(error)) {
      debug("No matching creation rules found", decryptedUri.path);
    } else {
      throw error;
    }
  }
}

function isNoMatchingRulesError(error: unknown) {
  return error instanceof Error && error?.message?.includes("no matching creation rules found");
}

class ParseError extends Error {
  constructor(public readonly originalError: unknown) {
    super(originalError instanceof Error ? originalError.message : `${originalError}`);
    if (originalError instanceof Error) {
      this.stack = originalError.stack;
    }
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

type ParsedObject =
  | string
  | number
  | boolean
  | {
      [key: string]: ParsedObject;
    };

function getParser(fileFormat: IFileFormat): (encoded: string) => ParsedObject | ParsedObject[] {
  return (content: string) => {
    try {
      switch (fileFormat) {
        case "yaml":
          return YAML.parseAllDocuments(content).map((doc) => doc.toJSON());
        case "json":
          return JSON.parse(content);
        case "ini":
          return INI.parse(content);
        case "dotenv":
          return DotEnv.parse(content);
        case "plaintext":
          return JSON.parse(content);
        case "binary":
          return JSON.parse(content);
      }
    } catch (error: unknown) {
      throw new ParseError(error);
    }
  };
}

async function ensureOpenDecryptedFile(encryptedUri: vscode.Uri, fileFormat: IFileFormat) {
  debug("Opening", encryptedUri.path);
  const decryptedUri = getDecryptedFileUri(encryptedUri);

  if (!(await fileExists(decryptedUri))) {
    debug("Not decrypted", decryptedUri.path);
    await decryptFileToFile(encryptedUri, decryptedUri, fileFormat);
  }

  const originalFileContent = await getDecryptedFileContent(encryptedUri, fileFormat);
  const currentFileContent = await getFileContent(decryptedUri);
  debug("Comparing files", { originalFileContent, currentFileContent });
  const encryptedContentChecksum = await getChecksum(originalFileContent);
  const decryptedContentChecksum = await getChecksum(currentFileContent);
  debug("Content checksums", { encryptedContentChecksum, decryptedContentChecksum });
  if (encryptedContentChecksum !== decryptedContentChecksum) {
    const encryptedStat = await vscode.workspace.fs.stat(encryptedUri);
    const decryptedStat = await vscode.workspace.fs.stat(decryptedUri);
    debug("Content stats", { encryptedStat, decryptedStat });
    if (encryptedStat.mtime > decryptedStat.mtime) {
      debug("Updating decrypted");
      await decryptFileToFile(encryptedUri, decryptedUri, fileFormat);
    } else if (encryptedStat.mtime < decryptedStat.mtime) {
      debug("Updating encrypted");
      await encryptFileToFile(decryptedUri, encryptedUri, fileFormat);
    }
  }
  if (!isFileOpen(decryptedUri)) {
    await openFile(decryptedUri);
  }
}

function isFileOpen(uri: vscode.Uri) {
  return vscode.window.visibleTextEditors.some((editor) => editor.document.uri.path === uri.path);
}

async function openFile(uri: vscode.Uri) {
  try {
    return await vscode.window.showTextDocument(uri);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Detail: File seems to be binary and cannot be opened as text")) {
      vscode.window.showWarningMessage(`File seems to be binary and cannot be opened as text: ${uri.path}`);
      return;
    }
    throw error;
  }
}

async function closeAndDeleteFile(uri: vscode.Uri) {
  // TODO close file first
  if (await fileExists(uri)) {
    await vscode.workspace.fs.delete(uri);
  }
}

async function decryptFileToFile(encryptedUri: vscode.Uri, decryptedUri: vscode.Uri, fileFormat: IFileFormat) {
  const decryptedContent = await getDecryptedFileContent(encryptedUri, fileFormat);
  await vscode.workspace.fs.writeFile(decryptedUri, convertUtf8ToUint8Array(decryptedContent));
}

async function encryptFileToFile(decryptedUri: vscode.Uri, encryptedUri: vscode.Uri, fileFormat: IFileFormat) {
  const encryptedContent = await getEncryptedFileContent(decryptedUri, encryptedUri, fileFormat);
  debug("Writing encrypted file", encryptedUri, encryptedContent);

  await vscode.workspace.fs.writeFile(encryptedUri, convertUtf8ToUint8Array(encryptedContent));
  debug("Wrote encrypted file", encryptedUri, encryptedContent);
}

async function getChecksum(content: string) {
  const md5sum = crypto.createHash("md5");
  md5sum.update(content);
  return md5sum.digest("hex");
}

async function getFileContent(uri: vscode.Uri) {
  const fileContent = await vscode.workspace.fs.readFile(uri);
  return convertUint8ArrayToUtf8(fileContent);
}

async function getDecryptedFileContent(uri: vscode.Uri, fileFormat: IFileFormat) {
  const encryptedContent = await getFileContent(uri);

  const tmpFileId = await getChecksum(Math.random().toString());
  const tmpEncryptedFilePath = path.join(os.tmpdir(), `${tmpFileId}.${fileFormat}`);

  try {
    const sopsConfigUri = await findSopsConfigRecursive(uri);

    let sopsConfigArgs: string[] = [];
    debug("sops config", sopsConfigUri);

    if (sopsConfigUri) {
      sopsConfigArgs = ["--config", sopsConfigUri.fsPath];
    }

    await fs.writeFile(tmpEncryptedFilePath, encryptedContent, { mode: 0o600 });

    debug("Decrypting", uri.path, encryptedContent);
    const { sopsGeneralArgs, sopsGeneralEnvVars } = await getSopsGeneralOptions();

    const decryptProcess = child_process.spawnSync(
      getSopsBinPath(),
      [...sopsGeneralArgs, ...sopsConfigArgs, "--output-type", fileFormat, "--input-type", fileFormat, "--decrypt", tmpEncryptedFilePath],
      {
        ...spawnOptions,
        env: {
          ...process.env,
          ...sopsGeneralEnvVars,
        },
      }
    );

    if (decryptProcess.error) {
      throw decryptProcess.error;
    }

    if (decryptProcess.stderr.toString()) {
      console.warn(decryptProcess.stderr.toString());
    }

    const decryptedContent = decryptProcess.stdout.toString();
    debug("Decrypted", uri.path, decryptedContent);

    if (!decryptedContent) {
      throw new Error(`Could not decrypt file: ${uri.path}, ${decryptProcess.stderr.toString()}`);
    }

    return decryptedContent;
  } finally {
    await fs.remove(tmpEncryptedFilePath);
  }
}

async function getEncryptedFileContent(uri: vscode.Uri, originalEncryptedUri: vscode.Uri, fileFormat: IFileFormat) {
  const decryptedContent = await getFileContent(uri);
  const originalEncryptedContent = await getFileContent(originalEncryptedUri);
  const tmpDecryptedFilePath = path.join(os.tmpdir(), await getChecksum(Math.random().toString()));

  const tmpFileId = await getChecksum(Math.random().toString());
  const tmpEncryptedFilePath = path.join(os.tmpdir(), `${tmpFileId}.${fileFormat}`);

  let tmpFakeDecryptedEditorPath = path.join(os.tmpdir(), await getChecksum(Math.random().toString()));
  let fakeDecryptedEditor = FAKE_DECRYPTED_EDITOR_SHELL;

  if (process.platform === "win32") {
    // Windows platform needs different fake editor commands
    tmpFakeDecryptedEditorPath = tmpFakeDecryptedEditorPath + ".cmd";
    fakeDecryptedEditor = FAKE_DECRYPTED_EDITOR_CMD;
  }

  try {
    const sopsConfigUri = await findSopsConfigRecursive(uri);

    let sopsConfigArgs: string[] = [];
    debug("sops config", sopsConfigUri);

    if (sopsConfigUri) {
      sopsConfigArgs = ["--config", sopsConfigUri.fsPath];
    }

    await fs.writeFile(tmpFakeDecryptedEditorPath, fakeDecryptedEditor, { mode: 0o755 });
    await fs.writeFile(tmpDecryptedFilePath, decryptedContent, { mode: 0o600 });
    await fs.writeFile(tmpEncryptedFilePath, originalEncryptedContent, { mode: 0o600 });

    debug("Encrypting", uri.path, decryptedContent);

    const { sopsGeneralArgs, sopsGeneralEnvVars } = await getSopsGeneralOptions();
    // const sopsBin = getSopsBinPath();
    // const cmds = [...sopsGeneralArgs, ...sopsConfigArgs, "--output-type", fileFormat, "--input-type", fileFormat, tmpEncryptedFilePath];
    const envs = {
      ...sopsGeneralEnvVars,
      EDITOR: normalizeCrossPlatformPath(tmpFakeDecryptedEditorPath),
      VSCODE_SOPS_DECRYPTED_FILE_PATH: tmpDecryptedFilePath,
    };

    // debug("SOPS command", sopsBin, cmds.join(" "), JSON.stringify(envs, undefined, 2));

    const encryptProcess = child_process.spawnSync(getSopsBinPath(), [...sopsGeneralArgs, ...sopsConfigArgs, "--output-type", fileFormat, "--input-type", fileFormat, tmpEncryptedFilePath], {
      ...spawnOptions,
      env: {
        ...process.env,
        ...envs,
      },
    });

    if (encryptProcess.error) {
      throw encryptProcess.error;
    }

    if (encryptProcess.stderr.toString()) {
      console.warn(encryptProcess.stderr.toString());
    }

    const encryptedContent = (await fs.readFile(tmpEncryptedFilePath)).toString();
    debug("Encrypted", uri.path, encryptedContent);

    if (!encryptedContent) {
      throw new Error(`Could not encrypt file: ${uri.path}, ${encryptProcess.stderr.toString()}`);
    }

    return encryptedContent;
  } finally {
    await fs.remove(tmpDecryptedFilePath);
    await fs.remove(tmpEncryptedFilePath);
    await fs.remove(tmpFakeDecryptedEditorPath);
  }
}

async function getNewEncryptedFileContent(decryptedUri: vscode.Uri, fileFormat: IFileFormat) {
  const tmpDirectoryPath = path.join(os.tmpdir(), await getChecksum(Math.random().toString()));
  await fs.ensureDir(tmpDirectoryPath);

  try {
    const decryptedContent = await getFileContent(decryptedUri);
    const sopsConfigUri = await findSopsConfigRecursive(decryptedUri.with({ path: path.dirname(decryptedUri.path) }));

    let sopsConfigArgs: string[] = [];
    let decryptedRelativePathToSopsConfig: string;
    if (sopsConfigUri) {
      decryptedRelativePathToSopsConfig = path.relative(path.dirname(sopsConfigUri.path), decryptedUri.path);
      const sopsConfigContent = await getFileContent(sopsConfigUri);
      debug("SOP config content", sopsConfigContent);
      const tmpSopsConfigPath = path.join(tmpDirectoryPath, path.basename(sopsConfigUri.path));
      await fs.writeFile(tmpSopsConfigPath, sopsConfigContent, { mode: 0o600 });
      sopsConfigArgs = ["--config", tmpSopsConfigPath];
      await fs.ensureDir(path.join(tmpDirectoryPath, path.dirname(decryptedRelativePathToSopsConfig)));
    } else {
      decryptedRelativePathToSopsConfig = path.basename(decryptedUri.path);
    }
    debug("Decrypted relative path to config", decryptedRelativePathToSopsConfig);

    const tmpDecryptedFilePath = path.join(tmpDirectoryPath, decryptedRelativePathToSopsConfig);
    await fs.writeFile(tmpDecryptedFilePath, decryptedContent, { mode: 0o600 });
    debug("Encrypting", decryptedUri.path, decryptedContent, tmpDecryptedFilePath);
    const { sopsGeneralArgs, sopsGeneralEnvVars } = await getSopsGeneralOptions();
    const encryptProcess = child_process.spawnSync(
      getSopsBinPath(),
      [...sopsGeneralArgs, ...sopsConfigArgs, "--output-type", fileFormat, "--input-type", fileFormat, "--encrypt", tmpDecryptedFilePath],
      {
        ...spawnOptions,
        env: {
          ...process.env,
          ...sopsGeneralEnvVars,
        },
      }
    );
    if (encryptProcess.error) {
      throw encryptProcess.error;
    }
    if (encryptProcess.stderr.toString()) {
      console.warn(encryptProcess.stderr.toString());
    }
    const encryptedContent = encryptProcess.stdout.toString();
    debug("Encrypted", decryptedUri.path, encryptedContent);
    if (!encryptedContent) {
      throw new Error(`Could not encrypt new file: ${decryptedUri.path}, ${encryptProcess.stderr.toString()}`);
    }
    return encryptedContent;
  } finally {
    await fs.remove(tmpDirectoryPath);
  }
}

async function findSopsConfigRecursive(dirUri: vscode.Uri): Promise<vscode.Uri | undefined> {
  const possibleSopsConfigUri = dirUri.with({ path: path.join(dirUri.path, SOPS_CONFIG_FILENAME).replace(/\\/g, "/") });
  if (await fileExists(possibleSopsConfigUri)) {
    debug("SOPS config", possibleSopsConfigUri.path);
    return possibleSopsConfigUri;
  } else if (path.dirname(dirUri.path) !== "." && path.dirname(dirUri.path) !== "/") {
    return await findSopsConfigRecursive(dirUri.with({ path: path.dirname(dirUri.path) }));
  } else {
    return undefined;
  }
}

async function fileExists(uri: vscode.Uri) {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (error: unknown) {
    return false;
  }
}

async function getSopsGeneralOptions() {
  const defaultAwsProfile: string | undefined = vscode.workspace.getConfiguration(CONFIG_BASE_SECTION).get(ConfigName.defaultAwsProfile);
  const defaultGcpCredentialsPath: string | undefined = vscode.workspace.getConfiguration(CONFIG_BASE_SECTION).get(ConfigName.defaultGcpCredentialsPath);
  const defaultAgeKeyFile: string | undefined = vscode.workspace.getConfiguration(CONFIG_BASE_SECTION).get(ConfigName.defaultAgeKeyFile);
  debug("config", { defaultAwsProfile, defaultGcpCredentialsPath, defaultAgeKeyFile });
  const rc = await getRunControl();
  const awsProfile = rc.awsProfile ?? defaultAwsProfile;
  let gcpCredentialsPath = rc.gcpCredentialsPath ?? defaultGcpCredentialsPath;
  let ageKeyFile = rc.ageKeyFile ?? defaultAgeKeyFile;

  const sopsGeneralArgs = [];
  const sopsGeneralEnvVars: any = {};

  if (awsProfile) {
    sopsGeneralArgs.push("--aws-profile", awsProfile);
    sopsGeneralEnvVars[AWS_PROFILE_ENV_VAR_NAME] = awsProfile; // --aws-profile argument doesn't work well
  }

  if (gcpCredentialsPath) {
    if (!path.isAbsolute(gcpCredentialsPath) && vscode.workspace.workspaceFolders) {
      for (const workspaceFolder of vscode.workspace.workspaceFolders) {
        const gcpCredentialsAbsPath = path.join(workspaceFolder.uri.path, gcpCredentialsPath);
        const gcpCredentialsUri = workspaceFolder.uri.with({ path: gcpCredentialsAbsPath });
        if (await fileExists(gcpCredentialsUri)) {
          gcpCredentialsPath = gcpCredentialsAbsPath;
          break;
        }
      }
    }
    sopsGeneralEnvVars[GCP_CREDENTIALS_ENV_VAR_NAME] = gcpCredentialsPath;
  }

  if (ageKeyFile) {
    if (!path.isAbsolute(ageKeyFile) && vscode.workspace.workspaceFolders) {
      for (const workspaceFolder of vscode.workspace.workspaceFolders) {
        const ageKeyFileAbsPath = path.join(workspaceFolder.uri.path, ageKeyFile);
        const ageKeyFileUri = workspaceFolder.uri.with({ path: ageKeyFileAbsPath });
        if (await fileExists(ageKeyFileUri)) {
          ageKeyFile = ageKeyFileAbsPath;
          break;
        }
      }
    }
    sopsGeneralEnvVars[AGE_KEY_FILE_ENV_VAR_NAME] = ageKeyFile;
  }

  debug("sops options", { sopsGeneralArgs, sopsGeneralEnvVars });

  return {
    sopsGeneralArgs,
    sopsGeneralEnvVars,
  };
}

async function getRunControl(): Promise<IRunControl> {
  const possibleRCUris: vscode.Uri[] = [];

  let rcPath = vscode.workspace.getConfiguration(CONFIG_BASE_SECTION).get(ConfigName.configPath);
  if (vscode.workspace.workspaceFolders) {
    if (typeof rcPath === "string") {
      for (const rootPath of vscode.workspace.workspaceFolders) {
        if (rcPath.charAt(0) === "/") {
          // absolute path in rc file
          possibleRCUris.push(rootPath.uri.with({ path: rcPath }));
        } else {
          possibleRCUris.push(rootPath.uri.with({ path: path.join(rootPath.uri.path, rcPath) }));
        }
      }
    }
    if (!rcPath) {
      for (const rootPath of vscode.workspace.workspaceFolders) {
        possibleRCUris.push(rootPath.uri.with({ path: path.join(rootPath.uri.path, DEFAULT_RUN_CONTROL_FILENAME) }));
      }
    }
  }

  for (const rcUri of possibleRCUris) {
    if (await fileExists(rcUri)) {
      const rcContent = await getFileContent(rcUri);
      try {
        const rc: IRunControl = YAML.parse(rcContent);
        debug("Parsed Run Control", rc);
        return rc ?? {};
      } catch (error: unknown) {
        debug("Invalid RC file format", error);
      }
    }
  }

  return {};
}

function isDecryptedFile(uri: vscode.Uri) {
  return path.basename(uri.path).startsWith(DECRYPTED_PREFIX);
}

function getDecryptedFileUri(encryptedUri: vscode.Uri): vscode.Uri {
  const decryptedFileName = DECRYPTED_PREFIX + path.basename(encryptedUri.path);
  const decryptedFilePath = path.join(path.dirname(encryptedUri.path), decryptedFileName);
  const decryptedFileUri = encryptedUri.with({ path: normalizeCrossPlatformPath(decryptedFilePath) });
  return decryptedFileUri;
}

function getEncryptedFileUri(decryptedUri: vscode.Uri): vscode.Uri | null {
  return isDecryptedFile(decryptedUri)
    ? decryptedUri.with({
        path: normalizeCrossPlatformPath(path.join(path.dirname(decryptedUri.path), path.basename(decryptedUri.path).substring(DECRYPTED_PREFIX.length))),
      })
    : null;
}

async function isSecretPairMember(uri: vscode.Uri) {
  if (isDecryptedFile(uri) || (await fileExists(getDecryptedFileUri(uri)))) {
    return true;
  } else {
    return false;
  }
}

function wait(timeoutMs: number) {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

function normalizeCrossPlatformPath(filePath: string) {
  return filePath.replace(/\\/g, "/");
}

export function activate(context: vscode.ExtensionContext) {
  debug("SOPS activated");

  let lastActiveEditor: vscode.TextEditor | undefined;
  const decryptedFileUris: vscode.Uri[] = [];

  async function syncStatusBar() {
    debug("syncing status bar");

    if (lastActiveEditor) {
      if (isDecryptedFile(lastActiveEditor.document.uri)) {
        toggleStatusBarItem.text = getToggleBarText("encrypted");
        debug("showing status bar for decrypted file", lastActiveEditor.document.uri.path);
        toggleStatusBarItem.show();
        return;
      }
      const decryptedFileUri = getDecryptedFileUri(lastActiveEditor.document.uri);
      if (decryptedFileUri && (await fileExists(decryptedFileUri))) {
        toggleStatusBarItem.text = getToggleBarText("decrypted");
        debug("showing status bar for encrypted file", lastActiveEditor.document.uri.path);
        toggleStatusBarItem.show();
        return;
      }
    }
    debug("hiding status bar");
    toggleStatusBarItem.hide();
  }

  const toggleOriginalFile = async () => {
    debug(`command ${Command.TOGGLE_ORIGINAL_FILE} executed`);
    if (!isEnabled(context)) {
      return;
    }

    if (lastActiveEditor) {
      let fileUriToOpen: vscode.Uri | undefined;
      debug("command toggle current uri", lastActiveEditor.document.uri);

      const encryptedFileUri = getEncryptedFileUri(lastActiveEditor.document.uri);
      debug("command encrypted file uri", encryptedFileUri);
      if (encryptedFileUri && (await fileExists(encryptedFileUri))) {
        debug("command encrypted file exists", encryptedFileUri.path);
        fileUriToOpen = encryptedFileUri;
      }

      const decryptedFileUri = getDecryptedFileUri(lastActiveEditor.document.uri);
      debug("command decrypted file uri", decryptedFileUri);
      if (decryptedFileUri && (await fileExists(decryptedFileUri))) {
        debug("command decrypted file exists", decryptedFileUri.path);
        fileUriToOpen = decryptedFileUri;
      }

      if (fileUriToOpen) {
        await openFile(fileUriToOpen);
      }
    }
  };

  const onActiveEditorChanged = async (editor: vscode.TextEditor | undefined) => {
    debug("change active editor", editor?.document.fileName);
    if (!isEnabled(context)) {
      return;
    }

    if (editor) {
      const document = editor.document;
      if (isDecryptedFile(document.uri)) {
        decryptedFileUris.push(document.uri);
      }

      if (!(await isSecretPairMember(document.uri))) {
        for (const decryptedFileUri of decryptedFileUris) {
          try {
            await closeAndDeleteFile(decryptedFileUri);
          } catch (error: unknown) {
            debug("Cannot close file", document.fileName, error);
            vscode.window.showErrorMessage(`Could not delete decrypted SOPS file ${editor?.document.fileName}: ${error instanceof Error ? error.message : error}`);
          }
        }
        decryptedFileUris.splice(0, decryptedFileUris.length);
      }

      try {
        if (!document.isUntitled) {
          const fileFormat = getSupportedFileFormat(document.languageId, document.fileName);
          if (fileFormat && !(await fileExists(getDecryptedFileUri(document.uri)))) {
            await handleFile(document, fileFormat);
          }
        }
      } catch (error: unknown) {
        debug("Cannot parse file", document.fileName, error);
        if (!(error instanceof ParseError)) {
          vscode.window.showErrorMessage(`Could not decrypt SOPS file ${document.fileName}: ${error instanceof Error ? error.message : error}`);
        }
      }

      lastActiveEditor = editor;
    }

    await syncStatusBar();
  };

  const onTextDocumentSaved = async (document: vscode.TextDocument) => {
    debug("save document", document.fileName);
    if (!isEnabled(context)) {
      return;
    }
    try {
      debug("save document language", document.languageId);
      const fileFormat = getSupportedFileFormat(document.languageId, document.fileName);
      if (fileFormat) {
        await handleSaveFile(document, fileFormat);
      }
    } catch (error: unknown) {
      debug("Cannot encrypt file", document.fileName, error);
      vscode.window.showErrorMessage(`Could not encrypt SOPS file ${document.fileName}: ${error instanceof Error ? error.message : error}`);
    }
  };

  const printInfo = () => {
    if (!isEnabled(context)) {
      return;
    }
    vscode.window.showInformationMessage("SOPS!");
  };

  const createSetBeta = (enableBeta: boolean) => () => {
    vscode.workspace.getConfiguration(CONFIG_BASE_SECTION).update(ConfigName.beta, enableBeta, vscode.ConfigurationTarget.Global);
  };

  const activeDisposables: vscode.Disposable[] = [];

  async function updateSubscriptions() {
    if (isEnabled(context)) {
      if (activeDisposables.length === 0) {
        await wait(20); // wait til opposite extension disposed commands
        debug("enabling subscriptions");

        activeDisposables.push(
          vscode.commands.registerTextEditorCommand(Command.TOGGLE_ORIGINAL_FILE, toggleOriginalFile),
          vscode.window.onDidChangeActiveTextEditor(onActiveEditorChanged),
          vscode.workspace.onDidSaveTextDocument(onTextDocumentSaved),
          vscode.commands.registerCommand(Command.INFO_COMMAND, printInfo),
          vscode.commands.registerCommand(Command.ENABLE_BETA, createSetBeta(true)),
          vscode.commands.registerCommand(Command.DISABLE_BETA, createSetBeta(false))
        );
        context.subscriptions.push(...activeDisposables);
      }
    } else {
      debug("disabling subscriptions");
      let activeDisposable: vscode.Disposable | undefined;
      while ((activeDisposable = activeDisposables.pop())) {
        activeDisposable.dispose();
        context.subscriptions.splice(context.subscriptions.indexOf(activeDisposable), 1);
      }
    }
  }

  const configurationChangesDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
    debug("configuration changed");
    if (event.affectsConfiguration(CONFIG_BASE_SECTION)) {
      debug("updating subscriptions");
      updateSubscriptions();
    }
  });
  context.subscriptions.push(configurationChangesDisposable);

  updateSubscriptions();
}

export function deactivate() {}
