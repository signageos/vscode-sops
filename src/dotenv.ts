/// <reference path="./dotenv-stringify.d.ts" />
import * as dotenv from 'dotenv';
import * as dotenvStringify from 'dotenv-stringify';

export const stringify = dotenvStringify;
export const parse = dotenv.parse;
