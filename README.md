# VSCode SOPS extension

## Info
The homepage of VSCode extension is located on https://github.com/signageos/vscode-sops

Extension for VSCode is available on market place https://marketplace.visualstudio.com/items?itemName=signageos.signageos-vscode-sops

## Features

VSCode extension with underlying [SOPS](https://github.com/mozilla/sops) supports:
- Realtime editing of encrypted `yaml`, `json` and `ini` files in-place in your project.
- Create new encrypted yaml/json file using `.sops.yaml` config creation_rules if available.

## Requirements

- Download and install SOPS from here: https://github.com/mozilla/sops/releases

*Make sure that `sops` is available in $PATH environment variable*

- Tutorial to SOPS: https://www.youtube.com/watch?v=V2PRhxphH2w

## Extension Settings
* `sops.enable`: enable/disable this extension (default: true)
* `sops.binPath`: Path to SOPS binary (default: executables from `$PATH`)
* `sops.configPath`: Path (absolute or relative) to the configuration for this extension (empty: defaults to `.sopsrc` in root of project) See [Config file](#config-file) section.
* `sops.defaults.awsProfile`: Default AWS profile name which will be used for sops command `--aws-profile` (empty: defaults to environment variable `$AWS_PROFILE`)
* `sops.defaults.gcpCredentialsPath`: Default path used to find GCP credentials. Overrides the `$GOOGLE_APPLICATION_CREDENTIALS` environment variable (empty: defaults to environment variable `$GOOGLE_APPLICATION_CREDENTIALS`)
* `sops.creationEnabled`: enable/disable this extension to try encrypt files included in .sops.yaml path_regex when is not encrypted yet (default: false)

## Config file
> Named `.sopsrc` in project root by default and is in YAML format.
```yaml
awsProfile: my-profile-1
gcpCredentialsPath: /home/user/Downloads/my-key.json
```

## Beta releases
The new features are published immediately into different extension package https://marketplace.visualstudio.com/items?itemName=signageos.signageos-vscode-sops-beta
> The reason is that vscode doesn't support beta releases built-in. See and vote for https://github.com/microsoft/vscode/issues/15756


## Known Issues
See https://github.com/signageos/vscode-sops/issues

## Release Notes

See https://github.com/signageos/vscode-sops/blob/master/CHANGELOG.md file.

-----------------------------------------------------------------------------------------------------------

**Enjoy!**
