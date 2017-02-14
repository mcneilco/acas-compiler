var gulp = require('gulp'),
	coffee = require('gulp-coffee'),
	gutil = require('gulp-util');
	watch = require('gulp-watch');

gulp.task('coffee', function() {
	gulp.src('./src/*.coffee')
		.pipe(coffee({bare: true}).on('error', gutil.log))
		.pipe(gulp.dest('./'));
});

gulp.task('watch', function () {
	gulp.watch(['./src/*.coffee'], ['coffee']);
});

gulp.task('default', ['watch']);