const path = require("path");

module.exports = {
  // Path to the starting file
  entry: path.resolve(__dirname, "src/index.js"),
  output: {
    // file name to use for the output file.
    filename: "bundle.js",
    // path of the output folder
    path: path.resolve(__dirname, "dist"),
    // name of the variable on which the exports object will be mapped.
    library: "mediasoup",
    // target type, universal module.
    libraryTarget: "umd",
  },
  module: {
    rules: [
      {
        test: /\.(js)$/,
        use: "babel-loader",
        exclude: /node_modules/,
      },
    ],
  },
  mode: process.env.NODE_ENV || "development",
};
