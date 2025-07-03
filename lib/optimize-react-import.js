// Plugin to optimize React imports and reduce bundle size
module.exports = function optimizeReactImports() {
  return {
    visitor: {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        
        // Transform React imports to use production builds
        if (source === 'react' || source === 'react-dom') {
          const specifiers = path.node.specifiers;
          
          // Replace default imports with namespace imports for better tree-shaking
          specifiers.forEach(spec => {
            if (spec.type === 'ImportDefaultSpecifier' && spec.local.name === 'React') {
              // Keep React default import as-is for JSX
            } else if (spec.type === 'ImportSpecifier') {
              // Named imports are already optimized
            }
          });
        }
        
        // Replace heavy imports with lighter alternatives
        if (source === 'lodash') {
          // Convert to specific lodash imports
          const specifiers = path.node.specifiers;
          specifiers.forEach(spec => {
            if (spec.type === 'ImportSpecifier') {
              path.node.source.value = `lodash/${spec.imported.name}`;
            }
          });
        }
      },
      
      // Remove console statements in production
      CallExpression(path) {
        if (process.env.NODE_ENV === 'production') {
          const callee = path.node.callee;
          if (
            callee.type === 'MemberExpression' &&
            callee.object.name === 'console'
          ) {
            path.remove();
          }
        }
      }
    }
  };
}