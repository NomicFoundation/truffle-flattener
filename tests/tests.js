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
    assert.include(flattened, "pragma solidity >=0.4.24 <0.8.0;");
    assert.include(flattened, "pragma solidity ^0.5.2;");
  });

  it("Should have proper whitespacing for the simple case", async function() {
    const content = await flatten(["./contracts/whitespace/simple.sol"]);
    const expected = "// File: contracts/whitespace/simple.sol\n"
      + "\n"
      + "// A simple contract\n";

    assert.equal(content, expected);
  });

  it("Should add missing trailing newlines", async function() {
    const content = await flatten(["./contracts/whitespace/missing-trailing-newline.sol"]);
    const expected = "// File: contracts/whitespace/missing-trailing-newline.sol\n"
      + "\n"
      + "// This file misses a trailing newline. But flattener is nice and adds it.\n";

    assert.equal(content, expected);
  });

  it("Should add empty line between imported files", async function() {
    const content = await flatten(["./contracts/whitespace/with-imports.sol"]);
    const expected =
      "// File: contracts/whitespace/simple.sol\n" +
      "\n" +
      "// A simple contract\n" +
      "\n" +
      "// File: contracts/whitespace/missing-trailing-newline.sol\n" +
      "\n" +
      "// This file misses a trailing newline. But flattener is nice and adds it.\n" +
      "\n" +
      "// File: contracts/whitespace/with-imports.sol\n" +
      "\n" +
      "// including others\n";

    assert.equal(content, expected);
  });
    
  it("Should fail if the provided root directory does not exist", async function() {
    try {
      await flatten(["./contracts/child.sol"], "no valid directory");
      assert.fail("This should have failed");
    } catch (error) {
      assert.strictEqual(error.message, "The specified root directory does not exist");
    }
  });
});
