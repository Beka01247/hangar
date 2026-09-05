export default {
	scripts: {
		install: ["hutch", "install", "--frozen-lockfile"],
		start: ["hutch", "electrobun", "dev"],
		dev: ["hutch", "electrobun", "dev", "--watch"],
		build: ["hutch", "electrobun", "build", "--env=stable"],
		typecheck: ["bunx", "tsc", "--noEmit"],
	},
	electrobun: {
		version: "2.0.1",
	},
};
