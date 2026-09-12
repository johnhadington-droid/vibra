const fs = require("fs");
const path = require("path");
const selfsigned = require("selfsigned");

const certificateDirectory = path.join(__dirname, "..", "certs");
const keyPath = path.join(certificateDirectory, "localhost-key.pem");
const certPath = path.join(certificateDirectory, "localhost.pem");

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    console.log("Certificado local ya existe.");
    process.exit(0);
}

fs.mkdirSync(certificateDirectory, { recursive: true });
const attributes = [{ name: "commonName", value: "localhost" }];
const extensions = [
    { name: "basicConstraints", cA: false },
    { name: "subjectAltName", altNames: [
        { type: 2, value: "localhost" },
        { type: 7, ip: "127.0.0.1" }
    ] }
];
const certificate = selfsigned.generate(attributes, {
    days: 365,
    keySize: 2048,
    algorithm: "sha256",
    extensions
});

fs.writeFileSync(keyPath, certificate.private, "utf8");
fs.writeFileSync(certPath, certificate.cert, "utf8");
console.log("Certificado local generado para https://localhost:3000");
