import Foundation
import JavaScriptCore
let root = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."
let context = JSContext()!
var failed = false
context.exceptionHandler = { _, exception in
    failed = true
    fputs("JavaScript error: \(exception?.toString() ?? "unknown")\n", stderr)
}
context.evaluateScript("class URL { constructor(v) { if(!/^https:\\/\\//.test(v))throw Error('invalid');this.protocol='https:';this.href=v; } }")
for name in ["core.js", "data.js"] {
    let source = try String(contentsOfFile: "\(root)/dist/\(name)", encoding: .utf8)
    context.evaluateScript(source, withSourceURL: URL(fileURLWithPath: name))
}
for name in ["app.js", "sw.js", "sync-core.js", "sync-ui.js"] {
    let source = try String(contentsOfFile: "\(root)/dist/\(name)", encoding: .utf8)
    context.setObject(source, forKeyedSubscript: "syntaxSource" as NSString)
    context.evaluateScript("new Function(syntaxSource)")
}
let tests = try String(contentsOfFile: "\(root)/tests/core.test.js", encoding: .utf8)
let result = context.evaluateScript(tests)
if failed { exit(1) }
print(result?.toString() ?? "No result")
