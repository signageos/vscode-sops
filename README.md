# VSCode SOPS extension

## Info
The homepage of VSCode extension is located on https://github.com/signageos/vscode-sops

## Features

VSCode extension with underlying [SOPS](https://github.com/mozilla/sops) supports:
- Realtime editing of encrypted yaml/json files in-place in your project.
- Create new encrypted yaml/json file using `.sops.yaml` config creation_rules if available.

## Requirements

- Download and install SOPS from here: https://github.com/mozilla/sops/releases

*Make sure that `sops` is available in $PATH environment variable*

- Tutorial to SOPS: https://www.youtube.com/watch?v=V2PRhxphH2w

- For encryption of file back after changes, you have to have [Node.js](https://nodejs.org/en/) installed on your PC (`node` bin in your `$PATH`)

## Extension Settings
*Options are currently unavailable in 0.0.1 version*
* `sops.enable`: enable/disable this extension (default: true)
* `sops.binPath`: Path to SOPS binary (default: executables from `$PATH`)
* `sops.configPath`: Path (absolute or relative) to the configuration for this extension (empty: defaults to `.sopsrc` in root of project) See [Config file](#config-file) section.
* `sops.defaults.awsProfile`: Default AWS profile name which will be used for sops command `--aws-profile` (empty: defaults to environment variable `$AWS_PROFILE`)
* `sops.defaults.gcpCredentialsPath`: Default path used to find GCP credentials. Overrides the `$GOOGLE_APPLICATION_CREDENTIALS` environment variable (empty: defaults to environment variable `$GOOGLE_APPLICATION_CREDENTIALS`)

## Config file
> Named `.sopsrc` in project root by default and is in YAML format.
```yaml
awsProfile: my-profile-1
gcpCredentialsPath: /home/user/Downloads/my-key.json
```

## Known Issues


## Release Notes

See https://github.com/signageos/vscode-sops/blob/master/CHANGELOG.md file.

-----------------------------------------------------------------------------------------------------------

**Enjoy!**
