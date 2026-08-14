const express = require("express");
const cors = require("cors");
const path = require("path");
const querystring = require("querystring");
const dotenv = require("dotenv");
const os = require("os"); 

const helmet = require("helmet");
const { addonInterface, subtitlesHandler } = require("./addon");
const SubsRoClient = require("./lib/subsro");
const proxyRouter = require("./lib/proxy");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 7000;

// English language names + flags per ISO 639-2 code.
// The name is prepended to `lang` so stricter clients (e.g. Nuvio) can still
// normalize it back to a valid language code, while Stremio displays the raw
// text (including the format tag).
const LANGUAGE_LABELS = {
  ron: { name: "Romanian", flag: "🇷🇴" },
  eng: { name: "English", flag: "🇬🇧" },
  ita: { name: "Italian", flag: "🇮🇹" },
  fra: { name: "French", flag: "🇫🇷" },
  deu: { name: "German", flag: "🇩🇪" },
  hun: { name: "Hungarian", flag: "🇭🇺" },
  ell: { name: "Greek", flag: "🇬🇷" },
  por: { name: "Portuguese", flag: "🇵🇹" },
  spa: { name: "Spanish", flag: "🇪🇸" },
};

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(proxyRouter);

const decodeConfig = (configStr) => {
  if (!configStr) return {};
  try {
    const base64 = configStr
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(configStr.length + ((4 - (configStr.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
  } catch (e) {
    return {};
  }
};

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "configure.html")));
app.get("/configure", (req, res) => res.sendFile(path.join(__dirname, "public", "configure.html")));
app.get("/:config/configure", (req, res) => res.sendFile(path.join(__dirname, "public", "configure.html")));

const manifestHandler = (req, res) => {
  const { config } = req.params;
  const userConfig = decodeConfig(config);
  const hasConfig = config && Object.keys(userConfig).length > 0;

  const manifest = {
    ...addonInterface.manifest,
    behaviorHints: {
      ...addonInterface.manifest.behaviorHints,
      configurationRequired: !hasConfig,
    },
  };

  res.set("Cache-Control", "public, max-age=86400"); // 1 day
  res.json(manifest);
};

app.get("/manifest", manifestHandler);
app.get("/manifest.json", manifestHandler);
app.get("/:config/manifest", manifestHandler);
app.get("/:config/manifest.json", manifestHandler);

app.get("/api/validate/:apiKey", async (req, res) => {
  const { apiKey } = req.params;
  const client = new SubsRoClient(apiKey);
  const result = await client.validate();
  console.log(
    `[VALIDATE] ${result.valid ? "OK" : "FAILED (reason: " + result.reason + ")"} for key ...${apiKey.slice(-6)}`,
  );
  res.json({ valid: result.valid, reason: result.reason });
});

app.get("/:config?/subtitles/:type/:id/:extra?.json", async (req, res) => {
  const { config, type, id, extra } = req.params;
  const userConfig = decodeConfig(config);

  console.log(`\n=========================================`);
  console.log(`🎬 Stremio a cerut subtitrare!`);
  console.log(`🎥 Tip: ${type} | ID Film/Episod: ${id}`);
  console.log(`=========================================\n`);

  const protocol = req.headers["x-forwarded-proto"] || (req.secure ? "https" : req.protocol);
  const host = req.headers["x-forwarded-host"] || req.get("host");
  userConfig.baseUrl = `${protocol}://${host}`;

  try {
    let extraObj = {};
    if (extra) {
      try {
        extraObj = JSON.parse(extra);
      } catch (e) {
        extraObj = querystring.parse(extra);
      }
    }
    const response = await subtitlesHandler({
      type,
      id,
      extra: extraObj,
      config: userConfig,
    });
    
    console.log(`✅ Am gasit ${response.subtitles ? response.subtitles.length : 0} subtitrari pentru acest film.`);
    
    if (response.subtitles && response.subtitles.length > 0) {
      response.subtitles = response.subtitles.map((sub, index) => {
        let extractedName = "";
        
        if (sub.url && sub.url.includes('/proxy/')) {
          const urlParts = sub.url.split('/');
          const base64Index = urlParts.findIndex(p => p === 'proxy') + 2; 
          if (urlParts[base64Index]) {
            try {
              let decoded = Buffer.from(urlParts[base64Index], 'base64').toString('utf-8');
              decoded = decoded.replace(/\.(srt|sub|txt|vtt)$/i, '').trim();
              if (decoded.includes('/')) {
                decoded = decoded.split('/').pop().trim();
              }
              extractedName = decoded;
            } catch (e) {}
          }
        }
        
        let finalTitle = extractedName || sub.title || sub.filename || `Subtitrare ${index + 1}`;
        let shortFormat = "Standard";
        let upperTitle = finalTitle.toUpperCase();
        
        if (upperTitle.includes("BLURAY") || upperTitle.includes("BRRIP") || upperTitle.includes("BDRIP")) {
            shortFormat = "BluRay";
        } else if (upperTitle.includes("WEB-DL") || upperTitle.includes("WEBDL") || upperTitle.includes("WEB")) {
            shortFormat = "WEB-DL";
        } else if (upperTitle.includes("WEBRIP") || upperTitle.includes("WEB-RIP")) {
            shortFormat = "WEBRip";
        } else if (upperTitle.includes("HDRIP") || upperTitle.includes("HD-RIP")) {
            shortFormat = "HDRip";
        } else if (upperTitle.includes("CAM") || upperTitle.includes("TS") || upperTitle.includes("HDCAM")) {
            shortFormat = "CAM/TS";
        } else if (upperTitle.includes("DVD") || upperTitle.includes("DVDRIP") || upperTitle.includes("DVDSCR")) {
            shortFormat = "DVDRip";
        } else if (upperTitle.includes("HDTV")) {
            shortFormat = "HDTV";
        }

        const langInfo = LANGUAGE_LABELS[sub.lang] || { name: sub.lang || "Subtitle", flag: "" };
        const langLabel = [langInfo.name, langInfo.flag, shortFormat]
          .filter(Boolean)
          .join(" ");
        console.log(`  🔎 [Subtitrarea ${index + 1}] -> Format: ${shortFormat} | Lang: ${langLabel}`);
        
        return {
          id: sub.id,
          url: sub.url,
          // `lang` contains the language name (normalizable by Nuvio) plus the
          // format tag (shown as raw text by Stremio). This keeps both clients
          // happy while preserving the format labels.
          lang: langLabel,
          title: langLabel + "\nSubs.ro Subtitles"
        };
      });
    }
    
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate"); 
    res.json(response);
  } catch (e) {
    console.log(`❌ Eroare la cautare:`, e.message);
    res.status(500).json({ subtitles: [] });
  }
});

// Only start a long-lived HTTP server when running directly (local development).
// On serverless platforms (e.g. Vercel), the Express app is exported and mounted
// as a function handler instead.
if (require.main === module) {
  app.listen(PORT, () => {
    const networkInterfaces = os.networkInterfaces();
    let localIp = '127.0.0.1';

    for (const interfaceName in networkInterfaces) {
      // Ignoram placile de retea virtuale (Docker, vEthernet, VPN)
      if (interfaceName.toLowerCase().includes('veth') || interfaceName.toLowerCase().includes('docker')) continue;

      for (const iface of networkInterfaces[interfaceName]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          // Prioritizam adresele standard de router din casa
          if (iface.address.startsWith('192.168.')) {
              localIp = iface.address;
          } else if (localIp === '127.0.0.1') {
              localIp = iface.address; // Fallback
          }
        }
      }
    }

    console.log(`🚀 Addon live pe portul ${PORT}`);
    console.log(`[INFO] Format cu steag 🇷🇴 afisat in titlul subtitrarii.`);
    console.log(`\n======================================================`);
    console.log(`🌐 PENTRU TV / TELEFON (Baza linkului tau local):`);
    console.log(`➡️  http://${localIp}:${PORT}`);
    console.log(`\n💻 PENTRU PC (Baza linkului tau local):`);
    console.log(`➡️  http://127.0.0.1:${PORT}`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;
