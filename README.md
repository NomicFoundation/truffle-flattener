# truffle-flattener

Truffle Flattener concats solidity files developed under Truffle with all of
their dependencies.

This tool helps you to verify contracts developed with Truffle on
[Etherscan](https://etherscan.io), or debugging them on
[Remix](https://remix.ethereum.org), by merging your files and their
dependencies in the right order.

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
