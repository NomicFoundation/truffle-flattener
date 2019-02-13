const assert = require("chai").assert;

const flatten = require("../index");

function getFilesInFlattenedOrder(flattenOutput) {
  const regex = /\/\/ File: (.*)/;

  return flattenOutput
    .split(/[\n\r]+/)
    .filter(line => line.match(regex))
    .map(line => line.match(regex)[1]);
}

describe("flattening", function() {
  before(function() {
    process.chdir(__dirname);
  });

  it("Should include the parent if the only entry is the child", async function() {
    const files = getFilesInFlattenedOrder(
      await flatten(["./contracts/child.sol"])
    );

    assert.include(files, "contracts/parent.sol");
  });

  it("Should give a topological order of the files and dependencies", async function() {
    const files = getFilesInFlattenedOrder(
      await flatten(["./contracts/child.sol"])
    );

    assert.deepEqual(files, [
      "openzeppelin-solidity/contracts/access/Roles.sol",
      "contracts/parent.sol",
      "openzeppelin-solidity/contracts/access/roles/PauserRole.sol",
      "contracts/child.sol"
    ]);
  });

  it("Shouldn't repeat contracts", async function() {
    const files = getFilesInFlattenedOrder(
      await flatten([
        "./contracts/child.sol",
        "./contracts/child.sol",
        "./contracts/parent.sol"
      ])
    );

    assert.deepEqual(files, [
      "openzeppelin-solidity/contracts/access/Roles.sol",
      "contracts/parent.sol",
      "openzeppelin-solidity/contracts/access/roles/PauserRole.sol",
      "contracts/child.sol"
    ]);
  });

  it("Should fail if there's a cycle", async function() {
    try {
      await flatten(["./contracts/cycle1.sol"]);
      assert.fail("This should have failed");
    } catch (error) {
      assert.include(error.message, "There is a cycle in the dependency");
    }
  });

  it("Should leave multiple solidity pragmas", async function() {
    const flattened = await flatten([
      "./contracts/child.sol",
      "./contracts/child.sol",
      "./contracts/parent.sol"
    ]);

    assert.include(flattened, "pragma solidity ^0.5.0;");
    assert.include(flattened, "pragma solidity >=0.4.24 <0.6.0;");
    assert.include(flattened, "pragma solidity ^0.5.2;");
  });
});
