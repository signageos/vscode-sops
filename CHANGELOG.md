# Change Log

All notable changes to the "vscode-sops" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]
### Added
- Configuration `sops.enabled`, `sops.binPath` works now as expected.
- Run control (config) file `.vscodesopsrc` for local project/workspace specific configuration (AWS profile & GCP credentials).
- Support for adjusting `sops.defaultAwsProfile` & `sops.defaultGcpCredentialsPath` configuration of vscode extension.

## [0.0.2] - 2020-07-21
### Fixed
- Infinite reopening decrypted file of already decrypted file in new tab

## [0.0.1] - 2020-04-06
### Added
- Initial release
