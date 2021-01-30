# Docker Settings mediasoup Server

## ENV Variables

- [DEBUG](#debug)

### `DEBUG`

The value to control what the NPM [debug](https://www.npmjs.com/package/debug) module logs.

Example: "mediasoup:INFO\* _WARN_ _ERROR_"

- Optional
- Valid values: Check `debug` module manual
- Default: ""

## Other config

All other configuration is to be controlled by the config.js file. Mount the config file to '/service/config.js' in the container when running it.
