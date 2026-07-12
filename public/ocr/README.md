# OCR language data

These files are pinned copies of the Tesseract.js `4.0.0_best_int` language data so PDF timetable OCR does not depend on a third-party CDN at runtime.

- `tha.traineddata.gz`: `@tesseract.js-data/tha@1.0.0`, SHA-256 `4550a5505184d1b79cf10416d5b19e643001d95411d5e717954dd26feef3ae74`
- `eng.traineddata.gz`: `@tesseract.js-data/eng@1.0.0`, SHA-256 `45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91`

The LSTM-only core files are copied from `tesseract.js-core@6.1.2`. Tesseract.js selects the SIMD build when supported and otherwise uses the universal build.

- `core/tesseract-core-lstm.wasm.js`: SHA-256 `775a35df6f2ae100e02609443e6bd5cafcd07983dd6175454ca4a432a7730687`
- `core/tesseract-core-simd-lstm.wasm.js`: SHA-256 `9d7c43fb206dc9f48475228b46bf35f888fa9e6259da2e67d5a75c77049f2dc7`
