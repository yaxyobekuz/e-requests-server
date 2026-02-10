const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");

dotenv.config();

const config = require("./src/config/env.config");
const connectDB = require("./src/config/database.config");
const routes = require("./src/routes");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(mongoSanitize());
app.use(xss());

const limiter = rateLimit({
	windowMs: 60 * 1000,
	max: 120,
	standardHeaders: true,
	legacyHeaders: false,
});
app.use(limiter);

app.get("/health", (req, res) => {
	res.status(200).json({ status: "ok" });
});

app.use("/api", routes);

const startServer = async () => {
	await connectDB();
	app.listen(config.PORT, () => {
		console.log(`Server running on port ${config.PORT}`);
	});
};

startServer();
