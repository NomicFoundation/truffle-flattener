# truffle-flattener

[![npm](https://img.shields.io/npm/v/truffle-flattener.svg)](https://www.npmjs.com/package/truffle-flattener)

Truffle Flattener concats solidity files developed under Truffle with all of
their dependencies.

This tool helps you to verify contracts developed with Truffle on
[Etherscan](https://etherscan.io), or debugging them on
[Remix](https://remix.ethereum.org), by merging your files and their
dependencies in the right order.

Check out [Buidler](https://github.com/nomiclabs/buidler), our alternative to
Truffle. It's got flattening built-in, it's faster, and much more flexible.

# Installation

`npm install truffle-flattener -g`

# Usage

Just intall it with npm in your truffle project and run
`truffle-flattener <solidity-files>`.

# Why not [Solidity Flattener](https://github.com/BlockCatIO/solidity-flattener)?

This project is a [Truffle](https://github.com/trufflesuite/truffle) specific
reimplementation of Solidity Flattener. By being closely coupled to Truffle it
can take advantage of its dependencies resolution logic making `--solc-paths` a
thing of the past. It also supports flattening more than one file at once,
concatenating everything in the right order, whithout duplicating any file.

# Limitations

If you deploy your contracts with truffle's migrations the output of
`truffle-flattener` may not match while verifying it in Etherscan. You
can use [Solidity Flattener](https://github.com/BlockCatIO/solidity-flattener)
in that case, or deploy your contracts from [Remix](https://remix.ethereum.org).


Aliased imports (eg: `import {symbol1 as alias, symbol2} from "filename";`) are
not supported by `truffle-flattener`.
