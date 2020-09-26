# VSCode SOPS extension

## Info
The homepage of VSCode extension is located on https://github.com/signageos/vscode-sops

## Features

VSCode extension which allows to realtime edit [SOPS](https://github.com/mozilla/sops) encrypted yaml files in-place in your project

## Requirements

- Download and install SOPS from here: https://github.com/mozilla/sops/releases

*Make sure that `sops` is available in $PATH environment variable*

- Tutorial to SOPS: https://www.youtube.com/watch?v=V2PRhxphH2w

- For encryption of file back after changes, you have to have [Node.js](https://nodejs.org/en/) installed on your PC (`node` bin in your `$PATH`)

## Extension Settings
*Options are currently unavailable in 0.0.1 version*
* `sops.enable`: enable/disable this extension (default: true)
* `sops.binPath`: Path to SOPS binary (default: executables from `$PATH`)
* `sops.configPath`: Absolute path (Starts with /) or Relative path to project (Starts with ./) where the configuration for this extension is looking for (default: Looking for file `.vscodesopsrc` in root of project) See [Config file](#config-file) section.
* `sops.defaultAwsProfile`: Default AWS profile name which will be used for sops command `--aws-profile` (default: uses from environment variable `$AWS_PROFILE`)

## Config file
> Named `.vscodesopsrc` in project root by default and is in YAML format.
```yaml
awsProfile: my-profile-1
```

## Known Issues


## Release Notes

Users appreciate release notes as you update your extension.

### 0.0.1

Initial release of VSCode SOPS extension

-----------------------------------------------------------------------------------------------------------

**Enjoy!**
