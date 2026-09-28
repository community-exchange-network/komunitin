import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    {
      builder: 'mkdist',
      input: './src',
      outDir: './dist'
    }
  ],
  clean: true,
  declaration: false,
  sourcemap: true,
})
