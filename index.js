#! /usr/bin/env node

"use strict";

const process = require("process");
const fs = require("fs");
const path = require("path");

const findUp = require("find-up");
const semver = require("semver");
const Config = require("truffle-config");
const Resolver = require("truffle-resolver");
const tsort = require("tsort");
const parser = require("solidity-parser-antlr");
const mkdirp = require("mkdirp");

const PRAGAMA_SOLIDITY_VERSION_REGEX = /^\s*pragma\ssolidity\s+(.*?)\s*;/;
const SUPPORTED_VERSION_DECLARATION_REGEX = /^\^?\d+(\.\d+){1,2}$/;
const IMPORT_SOLIDITY_REGEX = /^\s*import(\s+).*$/gm;

function unique(array) {
  return [...new Set(array)];
}

function resolve(importPath) {
  const config = Config.default();
  const resolver = new Resolver(config);

  return new Promise((resolve, reject) => {
    resolver.resolve(importPath, (err, fileContents, filePath) => {
      if (err) {
        reject(err);
        return;
      }

      resolve({ fileContents, filePath });
    });
  });
}

function getDirPath(filePath) {
  return filePath.substring(0, filePath.lastIndexOf(path.sep));
}

function getDependencies(filePath, fileContents) {
  try {
    let ast = parser.parse(fileContents);
    let imports = [];
    parser.visit(ast, {
      ImportDirective: function(node) {
        imports.push(getNormalizedDependencyPath(node.path, filePath));
      }
    });
    return imports;
  } catch (error) {
    throw new Error(
      "Could not parse " + filePath + " for extracting its imports."
    );
  }
}

function getNormalizedDependencyPath(dependency, filePath) {
  if (dependency.startsWith("./") || dependency.startsWith("../")) {
    dependency = path.join(getDirPath(filePath), dependency);
    dependency = path.normalize(dependency);
  }
  return dependency;
}

async function dependenciesDfs(graph, visitedFiles, filePath) {
  visitedFiles.push(filePath);

  const resolved = await resolve(filePath);

  const dependencies = getDependencies(
    resolved.filePath,
    resolved.fileContents
  );

  for (let dependency of dependencies) {
    graph.add(dependency, filePath);

    const resolvedDependency = await resolve(dependency);

    if (!visitedFiles.includes(dependency)) {
      await dependenciesDfs(graph, visitedFiles, dependency);
    }
  }
}

async function getSortedFilePaths(entryPoints) {
  const graph = tsort();
  const visitedFiles = [];

  for (const entryPoint of entryPoints) {
    await dependenciesDfs(graph, visitedFiles, entryPoint);
  }

  let topologicalSortedFiles;
  try {
    topologicalSortedFiles = graph.sort();
  } catch (e) {
    if (e.toString().includes("Error: There is a cycle in the graph.")) {
      const message =
        "There is a cycle in the dependency" +
        " graph, can't compute topological ordering. Files:\n\t" +
        visitedFiles.join("\n\t");
      throw new Error(message);
    }
  }

  // If an entry has no dependency it won't be included in the graph, so we
  // add them and then dedup the array
  const withEntries = topologicalSortedFiles.concat(entryPoints);

  const files = unique(withEntries);

  return files;
}

async function printFileWithoutPragma(filePath, log) {
  const resolved = await resolve(filePath);
  const output = resolved.fileContents
    .replace(PRAGAMA_SOLIDITY_VERSION_REGEX, "")
    .replace(IMPORT_SOLIDITY_REGEX, "");

  log(output.trim());
}

async function getFileCompilerVersionDeclaration(filePath) {
  const resolved = await resolve(filePath);

  const matched = resolved.fileContents.match(PRAGAMA_SOLIDITY_VERSION_REGEX);

  if (matched === null) {
    return undefined;
  }

  const version = matched[1];

  if (!SUPPORTED_VERSION_DECLARATION_REGEX.test(version)) {
    throw new Error(
      `Unsupported compiler version declaration in ${filePath}: ${version}. Only pinned or ^ versions are supported.`
    );
  }

  return version;
}

async function normalizeCompilerVersionDeclarations(files) {
  let pinnedVersion;
  let pinnedVersionFile;

  let maxCaretVersion;
  let maxCaretVersionFile;

  for (const file of files) {
    const version = await getFileCompilerVersionDeclaration(file);

    if (version === undefined) {
      continue;
    }

    if (version.startsWith("^")) {
      if (maxCaretVersion == undefined) {
        maxCaretVersion = version;
        maxCaretVersionFile = file;
      } else {
        if (semver.gt(version.substr(1), maxCaretVersion.substr(1))) {
          maxCaretVersion = version;
          maxCaretVersionFile = file;
        }
      }
    } else {
      if (pinnedVersion === undefined) {
        pinnedVersion = version;
        pinnedVersionFile = file;
      } else if (pinnedVersion !== version) {
        throw new Error(
          "Differernt pinned compiler versions in " +
            pinnedVersionFile +
            " and " +
            file
        );
      }
    }

    if (maxCaretVersion !== undefined && pinnedVersion !== undefined) {
      if (!semver.satisfies(pinnedVersion, maxCaretVersion)) {
        throw new Error(
          "Incompatible compiler version declarations in " +
            maxCaretVersionFile +
            " and " +
            pinnedVersionFile
        );
      }
    }
  }

  if (pinnedVersion !== undefined) {
    return pinnedVersion;
  }

  return maxCaretVersion;
}

async function printContactenation(files, log) {
  const version = await normalizeCompilerVersionDeclarations(files);

  if (version) {
    log("pragma solidity " + version + ";");
  }

  for (const file of files) {
    log("\n// File: " + file + "\n");
    await printFileWithoutPragma(file, log);
  }
}

async function getTruffleRoot() {
  let truffleConfigPath = await findUp(["truffle.js", "truffle-config.js"]);
  if (!truffleConfigPath) {
    throw new Error(`
      Truffle Flattener must be run inside a Truffle project:
      truffle.js or truffle-config.js not found
    `);
  }

  return getDirPath(truffleConfigPath);
}

function getFilePathsFromTruffleRoot(filePaths, truffleRoot) {
  return filePaths.map(f => path.relative(truffleRoot, path.resolve(f)));
}

async function flatten(filePaths, log) {
  try {
    const truffleRoot = await getTruffleRoot();
    const filePathsFromTruffleRoot = getFilePathsFromTruffleRoot(
      filePaths,
      truffleRoot
    );

    process.chdir(truffleRoot);

    const sortedFiles = await getSortedFilePaths(filePathsFromTruffleRoot);
    await printContactenation(sortedFiles, log);
  } catch (error) {
    console.error(error, error.stack);
  }
}

async function main(args) {
  let filePaths = args;

  let outputFileIndex = args.indexOf("--output");
  let outputFilePath;

  if (outputFileIndex >= 0) {
    outputFilePath = args[outputFileIndex + 1];

    if (!outputFilePath) {
      console.warn(
        "you havn't provided output file path, ignoring. Usage: truffle-flattener <files> --output <output file path>"
      );
    }

    filePaths = args.filter(
      (arg, index) => index !== outputFileIndex && index !== outputFileIndex + 1
    );

    // Ensure output directory exists
    if (outputFilePath) {
      let outputDirPath = path.dirname(outputFilePath);
      let isOutputDirExists =
        fs.existsSync(outputDirPath) &&
        fs.lstatSync(outputDirPath).isDirectory();

      if (!isOutputDirExists) {
        console.log(
          `output directory not found, creating directory tree "${outputDirPath}"`
        );
        mkdirp.sync(outputDirPath);
      }

      let isOutputFileExists =
        fs.existsSync(outputFilePath) && fs.lstatSync(outputFilePath).isFile();
      if (isOutputFileExists) {
        console.log(
          `output file already exists, removing file "${outputFilePath}"`
        );
        fs.unlinkSync(outputFilePath);
      }
    }
  }

  if (!filePaths.length) {
    console.error("Usage: truffle-flattener <files>");
    return;
  }

  await flatten(filePaths, outputChunk => {
    if (outputFilePath) {
      fs.appendFileSync(outputFilePath, outputChunk + "\n");
    } else {
      console.log(outputChunk);
    }
  });
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = async function(filePaths) {
  let res = "";
  await flatten(filePaths, str => (res += str));
  return res;
};
