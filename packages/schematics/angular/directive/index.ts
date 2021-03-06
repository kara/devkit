/**
* @license
* Copyright Google Inc. All Rights Reserved.
*
* Use of this source code is governed by an MIT-style license that can be
* found in the LICENSE file at https://angular.io/license
*/
// TODO: replace `options: any` with an actual type generated from the schema.
// tslint:disable:no-any
import {
  Rule,
  Tree,
  apply,
  branchAndMerge,
  chain,
  filter,
  mergeWith,
  move,
  noop,
  template,
  url,
} from '@angular-devkit/schematics';
import 'rxjs/add/operator/merge';
import * as ts from 'typescript';
import * as stringUtils from '../strings';
import { addDeclarationToModule, addExportToModule } from '../utility/ast-utils';
import { InsertChange } from '../utility/change';
import { buildRelativePath, findModule } from '../utility/find-module';


function addDeclarationToNgModule(options: any): Rule {
  return (host: Tree) => {
    if (options.skipImport) {
      return host;
    }

    let modulePath;
    if (options.module) {
      if (!host.exists(options.module)) {
        throw new Error(`Module specified (${options.module}) does not exist.`);
      }
      modulePath = options.module;
    } else {
      let pathToCheck = options.sourceDir + '/' + options.path;
      pathToCheck += options.flat ? '' : '/' + stringUtils.dasherize(options.name);
      modulePath = findModule(host, pathToCheck);
    }

    let sourceText = host.read(modulePath) !.toString('utf-8');
    let source = ts.createSourceFile(modulePath, sourceText, ts.ScriptTarget.Latest, true);

    const directivePath = `/${options.sourceDir}/${options.path}/`
                          + (options.flat ? '' : stringUtils.dasherize(options.name) + '/')
                          + stringUtils.dasherize(options.name)
                          + '.directive';
    const relativePath = buildRelativePath(modulePath, directivePath);
    const classifiedName = stringUtils.classify(`${options.name}Directive`);
    const declarationChanges = addDeclarationToModule(source,
                                                      modulePath,
                                                      classifiedName,
                                                      relativePath);
    const declarationRecorder = host.beginUpdate(modulePath);
    for (const change of declarationChanges) {
      if (change instanceof InsertChange) {
        declarationRecorder.insertLeft(change.pos, change.toAdd);
      }
    }
    host.commitUpdate(declarationRecorder);

    if (options.export) {
      sourceText = host.read(modulePath) !.toString('utf-8');
      source = ts.createSourceFile(modulePath, sourceText, ts.ScriptTarget.Latest, true);

      const exportRecorder = host.beginUpdate(modulePath);
      const exportChanges = addExportToModule(source, modulePath,
                                              stringUtils.classify(`${options.name}Directive`),
                                              relativePath);

      for (const change of exportChanges) {
        if (change instanceof InsertChange) {
          exportRecorder.insertLeft(change.pos, change.toAdd);
        }
      }
      host.commitUpdate(exportRecorder);
    }

    return host;
  };
}


function buildSelector(options: any) {
  let selector = stringUtils.dasherize(options.name);
  if (options.prefix) {
    selector = `${options.prefix}-${selector}`;
  }

  return selector;
}

export default function (options: any): Rule {
  options.selector = options.selector || buildSelector(options);

  const templateSource = apply(url('./files'), [
    options.spec ? noop() : filter(path => !path.endsWith('.spec.ts')),
    template({
      ...stringUtils,
      'if-flat': (s: string) => options.flat ? '' : s,
      ...options,
    }),
    move(options.sourceDir),
  ]);

  return chain([
    branchAndMerge(chain([
      addDeclarationToNgModule(options),
      mergeWith(templateSource),
    ])),
  ]);
}
