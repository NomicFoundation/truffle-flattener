# truffle-flattener

Truffle Flattener concats solidity files developed under Truffle with all of
their dependencies.

# Installation

`npm install --save-dev truffle-flattener`

# Usage

Just intall it with npm in your traffle project and run
`traffle-flattener <solidity-files>`.

# Why not [Solidity Flattener](https://github.com/BlockCatIO/solidity-flattener)?

This project is a [Truffle](https://github.com/trufflesuite/truffle) specific
reimplementation of Solidity Flattener. By being closely couple to Truffle it
can take advantage of its dependencies resolution logic making `--solc-paths` a
thing of the past. It also supports flattening more than one file at once,
concatenating everything in the right order, whithout duplicating any file.
