const fs = require('fs')
const path = require('path')

const gulp = require('gulp')
const less = require('gulp-less')
const nunjucks = require('gulp-nunjucks')
const autoprefixer = require('gulp-autoprefixer')
const uglify = require('gulp-uglify')
const browserSync = require('browser-sync').create()

const compileLess = () => {
  return gulp.src('src/style.less')
    .pipe(less())
    .pipe(autoprefixer({
      browsers: ['last 2 versions'],
      cascade: false
    }))
    .pipe(gulp.dest('dist'))
}

const minifyJs = () => {
  return gulp.src('dist/index.bundle.js')
    .pipe(uglify())
    .pipe(gulp.dest('dist/index.bundle.js'))
}

const copyResources = () => {
  return gulp.src(['src/resources/**/*'], { base: 'src' })
    .pipe(gulp.dest('dist'))
}

const compileHtml = () => {

  let activityFilenames = fs.readdirSync(path.join(__dirname, 'src/activities'))
  console.log(activityFilenames)


  let activities = activityFilenames.map(activityFilename => {
    return {
      filename: activityFilename,
      id: path.basename(activityFilename, '.html'),
      content: fs.readFileSync(path.join(__dirname, 'src/activities', activityFilename), 'utf8')
    }
  })

  return gulp.src('src/index.html')
    .pipe(nunjucks.compile({
      activities: activities
    }))
    .pipe(gulp.dest('dist'))
}

gulp.task('compile:less', compileLess)
gulp.task('compile:html', compileHtml)
gulp.task('compile', gulp.parallel(compileHtml, compileLess, copyResources))

gulp.task('develop', () => {
  browserSync.init({
    server: {
      baseDir: './dist'
    }
  })

  gulp.watch('src/**/*.html', compileHtml)
  gulp.watch('src/**/*.less', compileLess)
  gulp.watch('src/resources/**/*', copyResources)
  gulp.watch('dist/**/*', () => {
    browserSync.reload()
    return Promise.resolve()
  })
})

gulp.task('distribute', gulp.parallel(compileHtml, compileLess, copyResources))
