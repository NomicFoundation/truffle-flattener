#! /usr/bin/env node

"use strict";

const process = require("process");
const fs = require("fs");
const path = require("path");
const findUp = require("find-up");
const tsort = require("tsort");
const parser = require("@solidity-parser/parser");
const mkdirp = require("mkdirp");
const Resolver = require("@resolver-engine/imports-fs").ImportsFsEngine;

const IMPORT_SOLIDITY_REGEX = /^\s*import(\s+).*$/gm;

function unique(array) {
  return [...new Set(array)];
}

async function resolve(importPath) {
  const resolver = Resolver();
  const filePath = await resolver.resolve(importPath);
  const fileContents = fs.readFileSync(filePath).toString();
  return { fileContents, filePath };
}

function getDirPath(filePath) {
  let index1 = filePath.lastIndexOf(path.sep);
  let index2 = filePath.lastIndexOf("/");
  return filePath.substring(0, Math.max(index1, index2));
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
      "Could not parse " + filePath + " for extracting its imports: " + error
    );
  }
}

function getNormalizedDependencyPath(dependency, filePath) {
  if (dependency.startsWith("./") || dependency.startsWith("../")) {
    dependency = path.join(getDirPath(filePath), dependency);
    dependency = path.normalize(dependency);
  }

  return dependency.replace(/\\/g, "/");
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

    if (!visitedFiles.includes(dependency)) {
      await dependenciesDfs(graph, visitedFiles, dependency);
    }
  }
}

async function getSortedFilePaths(entryPoints, projectRoot) {
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
  const withEntries = topologicalSortedFiles
    .concat(entryPoints)
    .map(f => fileNameToGlobalName(f, projectRoot));

  const files = unique(withEntries);

  return files;
}

async function fileContentWithoutImports(filePath) {
  const resolved = await resolve(filePath);
  const output = resolved.fileContents.replace(IMPORT_SOLIDITY_REGEX, "");

  // normalize whitespace to a single trailing newline
  return output.trim() + "\n";
}

function fileNameToGlobalName(fileName, projectRoot) {
  let globalName = getFilePathsFromProjectRoot([fileName], projectRoot)[0];
  if (globalName.indexOf("node_modules/") !== -1) {
    globalName = globalName.substr(
      globalName.indexOf("node_modules/") + "node_modules/".length
    );
  }

  return globalName;
}

async function printContactenation(files, log) {
  const parts = await Promise.all(
    files.map(async file => {
      return (
        "// File: " + file + "\n\n" + (await fileContentWithoutImports(file))
      );
    })
  );

  // add a single empty line between parts
  log(parts.join("\n"));
}

async function getProjectRoot() {
  let configFilePath = await findUp([
    "truffle.js",
    "truffle-config.js",
    "buidler.config.js",
    "buidler.config.ts"
  ]);
  if (!configFilePath) {
    throw new Error(`
      Truffle Flattener must be run inside a Truffle or Buidler project:
      truffle.js, truffle-config.js, buidler.config.js, nor buidler.config.ts found
    `);
  }

  return getDirPath(configFilePath);
}

function getFilePathsFromProjectRoot(filePaths, projectRoot) {
  return filePaths.map(f => path.relative(projectRoot, path.resolve(f)));
}

async function flatten(filePaths, log, root) {
  if (root && !fs.existsSync(root)) {
    throw new Error("The specified root directory does not exist");
  }

  const projectRoot = root || (await getProjectRoot());
  const filePathsFromProjectRoot = getFilePathsFromProjectRoot(
    filePaths,
    projectRoot
  );

  // TODO: Remove this WD manipulation.
  // If this is used as a tool this is OK, but it's not right
  // when used as a library.
  const wd = process.cwd();
  process.chdir(projectRoot);

  const sortedFiles = await getSortedFilePaths(
    filePathsFromProjectRoot,
    projectRoot
  );
  await printContactenation(sortedFiles, log);

  process.chdir(wd);
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
      fs.appendFileSync(outputFilePath, outputChunk);
    } else {
      process.stdout.write(outputChunk);
    }
  });
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(console.error);
}

module.exports = async function(filePaths, root) {
  let res = "";
  await flatten(filePaths, str => (res += str), root);
  return res;
};
