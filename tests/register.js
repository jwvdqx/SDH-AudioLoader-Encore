// Lets the tests load the plugin's TypeScript files directly (no extra tools needed:
// it uses the "typescript" package that the build already installs).
const ts = require("typescript");
const fs = require("fs");

function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const out = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  });
  module._compile(out.outputText, filename);
}

require.extensions[".ts"] = compileTypeScript;
require.extensions[".tsx"] = compileTypeScript;

// "decky-frontend-lib" only exists inside Steam. The tests never use it, so an empty stand-in is enough.
const Module = require("module");
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "decky-frontend-lib") return {};
  return originalLoad.call(this, request, ...rest);
};
