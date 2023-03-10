const { app, BrowserWindow, ipcMain, dialog } = require("electron")
const { readdir } = require("node:fs/promises")
const path = require("node:path")

let webSecurity
if (process.env.NODE_ENV === "development") {
   // Necessary to allow SVGs to be loaded from the local filesystem whilst
   // running the dev server at localhost.
   webSecurity = false
   app.commandLine.appendSwitch("disable-site-isolation-trials")
   process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true"
} else {
   webSecurity = true
}

const createWindow = () => {
   const window = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
         sandbox: false,
         contextIsolation: false,
         nodeIntegration: true,
         nodeIntegrationInWorker: true,
         webSecurity,
      },
   })
   ipcMain.handle("quit", () => {
      app.quit()
   })
   ipcMain.handle("openDirectory", async () => {
      let { filePaths } = await dialog.showOpenDialog(window, {
         properties: ["openDirectory"],
      })
      return filePaths.length > 0 ? filePaths[0] : null
   })
   if (process.env.NODE_ENV === "development") {
      // Load the Vite dev server page.
      window.loadURL("http://localhost:5173/")
      window.webContents.openDevTools({ mode: "bottom" })
   } else {
      // Load the production build.
      window.loadFile(path.join(__dirname, "..", "dist-web", "index.html"))
   }
}

app.whenReady().then(() => {
   createWindow()
})

app.on("window-all-closed", () => {
   app.quit()
})
