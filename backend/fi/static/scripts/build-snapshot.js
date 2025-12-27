const esbuild = require('esbuild');

async function build() {
  try {
    await esbuild.build({
      entryPoints: ['snapshot/index.js'],
      bundle: true,
      format: 'iife',
      outfile: 'dom_snapshot.js',
      minify: true,
      banner: {
        js: '// @ts-nocheck',
      },
    });
    console.log('Built dom_snapshot.js');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

build();


