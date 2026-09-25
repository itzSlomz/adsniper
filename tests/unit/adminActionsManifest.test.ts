import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

type ActionSpec = {
  file: string;
  name: string;
};

const ADMIN_ACTIONS: readonly ActionSpec[] = [
  { file: "actions.ts", name: "clearSamples" },
  { file: "actions.ts", name: "loadSamples" },
  { file: "actions.ts", name: "runNow" },
  { file: "actions.ts", name: "testStorage" },
  { file: "brands/actions.ts", name: "createBrand" },
  { file: "brands/actions.ts", name: "resolveNow" },
  { file: "brands/actions.ts", name: "saveBrand" },
  { file: "brands/actions.ts", name: "toggleBrand" },
  { file: "brief/actions.ts", name: "regenerate" },
  { file: "brief/actions.ts", name: "save" },
  { file: "log-ad/actions.ts", name: "logAd" },
  { file: "mentions/actions.ts", name: "pullNow" },
  { file: "mentions/actions.ts", name: "removeMention" },
  { file: "mentions/actions.ts", name: "saveMentionSettings" },
  { file: "quick-add-post/actions.ts", name: "addPost" },
  { file: "settings/actions.ts", name: "save" },
  { file: "settings/actions.ts", name: "saveInstance" },
  { file: "settings/actions.ts", name: "saveOffers" },
  { file: "users/actions.ts", name: "addUser" },
  { file: "users/actions.ts", name: "removeUser" },
  { file: "weekly-brief/actions.ts", name: "regenerate" },
  { file: "weekly-brief/actions.ts", name: "save" },
] as const;

const intelRoot = path.join(process.cwd(), "src", "app", "(dash)", "intel");

function sourceFilesBelow(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesBelow(fullPath);
    return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function isUseServerModule(sourceFile: ts.SourceFile): boolean {
  const first = sourceFile.statements[0];
  return (
    !!first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use server"
  );
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    !!ts.getModifiers(node)?.some((modifier) => modifier.kind === kind)
  );
}

function exportedAsyncFunctions(
  sourceFile: ts.SourceFile
): ts.FunctionDeclaration[] {
  return sourceFile.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      !!statement.name &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
      hasModifier(statement, ts.SyntaxKind.AsyncKeyword)
  );
}

function exportedStatements(sourceFile: ts.SourceFile): ts.Statement[] {
  return sourceFile.statements.filter((statement) =>
    hasModifier(statement, ts.SyntaxKind.ExportKeyword)
  );
}

function inlineServerActions(sourceFile: ts.SourceFile): string[] {
  const actions: string[] = [];
  const visit = (node: ts.Node) => {
    const isFunctionWithBody =
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node);
    const body =
      isFunctionWithBody && node.body && ts.isBlock(node.body) ? node.body : null;
    if (
      body &&
      ts.isExpressionStatement(body.statements[0]) &&
      ts.isStringLiteral(body.statements[0].expression) &&
      body.statements[0].expression.text === "use server"
    ) {
      const parent = node.parent;
      const name =
        (ts.isFunctionDeclaration(node) ||
          ts.isFunctionExpression(node) ||
          ts.isMethodDeclaration(node)) &&
        node.name &&
        ts.isIdentifier(node.name)
          ? node.name.text
          : ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
            ? parent.name.text
            : "<anonymous>";
      actions.push(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return actions;
}

function isRequireAdminCall(expression: ts.Expression): boolean {
  if (!ts.isAwaitExpression(expression)) return false;
  const call = expression.expression;
  return (
    ts.isCallExpression(call) &&
    ts.isIdentifier(call.expression) &&
    call.expression.text === "requireAdmin" &&
    call.arguments.length === 0
  );
}

function guardIsFirst(action: ts.FunctionDeclaration): boolean {
  const statement = action.body?.statements[0];
  if (!statement) return false;
  if (ts.isExpressionStatement(statement)) {
    return isRequireAdminCall(statement.expression);
  }
  if (!ts.isVariableStatement(statement)) return false;
  const declarations = statement.declarationList.declarations;
  return (
    declarations.length === 1 &&
    !!declarations[0].initializer &&
    isRequireAdminCall(declarations[0].initializer)
  );
}

function importsSharedGuard(sourceFile: ts.SourceFile): boolean {
  return sourceFile.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@/lib/authorization"
    ) {
      return false;
    }
    const bindings = statement.importClause?.namedBindings;
    return (
      !!bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some(
        (element) =>
          element.name.text === "requireAdmin" && element.propertyName === undefined
      )
    );
  });
}

function importsAction(
  page: ts.SourceFile,
  actionName: string
): boolean {
  return page.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "./actions"
    ) {
      return false;
    }
    const bindings = statement.importClause?.namedBindings;
    return (
      !!bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some(
        (element) =>
          element.name.text === actionName && element.propertyName === undefined
      )
    );
  });
}

function isWiredToActionProp(page: ts.SourceFile, actionName: string): boolean {
  let wired = false;
  const forwardedProps = new Set<string>();
  const findBinding = (node: ts.Node) => {
    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === actionName
    ) {
      const propName = node.name.getText(page);
      if (["action", "formAction"].includes(propName)) wired = true;
      else if (/Action$/.test(propName)) forwardedProps.add(propName);
    }
    ts.forEachChild(node, findBinding);
  };
  findBinding(page);

  const findForwardedFormAction = (node: ts.Node) => {
    if (
      ts.isJsxAttribute(node) &&
      ["action", "formAction"].includes(node.name.getText(page)) &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression &&
      ts.isIdentifier(node.initializer.expression) &&
      forwardedProps.has(node.initializer.expression.text)
    ) {
      wired = true;
    }
    ts.forEachChild(node, findForwardedFormAction);
  };
  findForwardedFormAction(page);
  return wired;
}

function key(spec: ActionSpec): string {
  return `${spec.file}#${spec.name}`;
}

describe("admin Server Action manifest", () => {
  const parsed = new Map(
    sourceFilesBelow(intelRoot).map((file) => [
      path.relative(intelRoot, file).replaceAll("\\", "/"),
      parse(file),
    ])
  );

  test("accounts for exactly 22 exported actions and no inline actions", () => {
    const discovered = [...parsed.entries()].flatMap(([file, sourceFile]) =>
      isUseServerModule(sourceFile)
        ? exportedAsyncFunctions(sourceFile).map((action) => ({
            file,
            name: action.name!.text,
          }))
        : []
    );
    const inline = [...parsed.values()].flatMap(inlineServerActions);

    expect(discovered.map(key).sort()).toEqual(ADMIN_ACTIONS.map(key).sort());
    expect(discovered).toHaveLength(22);
    expect(inline).toEqual([]);
  });

  test("keeps use-server modules limited to async function exports", () => {
    for (const sourceFile of parsed.values()) {
      if (!isUseServerModule(sourceFile)) continue;
      expect(exportedStatements(sourceFile)).toEqual(
        exportedAsyncFunctions(sourceFile)
      );
    }
  });

  test.each(ADMIN_ACTIONS)(
    "$file#$name imports the guard first and is wired to its page",
    ({ file, name }) => {
      const sourceFile = parsed.get(file);
      expect(sourceFile).toBeDefined();
      expect(isUseServerModule(sourceFile!)).toBe(true);
      expect(importsSharedGuard(sourceFile!)).toBe(true);

      const action = exportedAsyncFunctions(sourceFile!).find(
        (candidate) => candidate.name?.text === name
      );
      expect(action).toBeDefined();
      expect(guardIsFirst(action!)).toBe(true);

      const pageFile = path.join(path.dirname(sourceFile!.fileName), "page.tsx");
      const page = parse(pageFile);
      expect(importsAction(page, name)).toBe(true);
      expect(isWiredToActionProp(page, name)).toBe(true);
    }
  );
});
