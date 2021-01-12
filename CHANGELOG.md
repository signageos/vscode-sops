# Change Log

All notable changes to the "vscode-sops" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]
### Added
- Support to parse even multiple yaml declarations in a single YAML file

### Fixed
- Skip parsing error messages when detecting SOPS kind file

## [0.3.0]
### Added
- Keep decrypted file on FS when showing original encrypted file (allow fast toggling files)
- Button in bottom status bar for easier toggling between encrypted & decrypted files
- Easy switching between stable release and beta release using new configuration `sops.beta` (or commands `sops.enable_beta`/`sops.disable_beta`).

### Fixed
- Occasionally not decrypting sops file when it was already encrypted early before
- Clean event listeners on deactivating extension
- Remove requirement on globally installed node.js

## [0.2.0]
### Added
- Support for `ini` files

## [0.1.2]
### Fixed
- Relative paths for `gcpCredentialsPath` option.

## [0.1.1]
### Fixed
- `sops.creationEnabled` has to be explicitly enabled to allow encrypt not encrpyted files

## [0.1.0]
### Added
- Configuration `sops.enabled`, `sops.binPath` works now as expected.
- Run control (config) file `.sopsrc` for local project/workspace specific configuration (AWS profile & GCP credentials).
- Support for adjusting `sops.defaults.awsProfile` & `sops.defaults.gcpCredentialsPath` configuration of vscode extension.
- Handle creation of new sops files if `creation_rules` of SOPS config `.sops.yaml` match currently saved file.

## [0.0.2] - 2020-07-21
### Fixed
- Infinite reopening decrypted file of already decrypted file in new tab

## [0.0.1] - 2020-04-06
### Added
- Initial release
