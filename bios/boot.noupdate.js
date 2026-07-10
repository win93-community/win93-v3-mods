/* use this mainly for testing and modding, i am not responsible for you missing out on features. only for 3.1.3 at this moment */
import { client } from "../42/api/os/network/client.js"

// @ts-ignore
const { bios, desktop } = window.sys42
const biosEl = bios.el

desktop.removeBoot ??= () => {
  document.querySelector("output#boot")?.remove()
  document.querySelector("#bootStyles")?.remove()
  document.querySelector("#bootStyles")?.remove()
}

bios.traceHeader()

function span(text) {
  const span = document.createElement("span")
  span.append(text)
  return span
}

function log(...args) {
  biosEl.append(...args.map((x) => (typeof x === "string" ? span(x) : x)))
  biosEl.scrollTop = biosEl.scrollHeight
}

function logError(error) {
  const span = document.createElement("span")
  span.classList = "ansi-red"
  span.textContent = error.stack + "\n"
  biosEl.append(span)
  biosEl.scrollTop = biosEl.scrollHeight
}

function getSortableDateTime(date = new Date()) {
  const year = String(date.getFullYear()).slice(2)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")
  return `${year}/${month}/${day},${hours}:${minutes}:${seconds}`
}

async function installCache(revision, hasCaches, options) {
  const [
    cache,
    tarball,
    { tarExtractPipe }, //
    { getExtname },
    { extnames },
  ] = await Promise.all([
    caches.open(revision),
    fetch("/42.tar.gz"),
    import("../42/formats/compression/tar/tarExtractPipe.js"),
    import("../42/lib/syntax/path/getExtname.js"),
    import("../42/lib/constant/FILE_TYPES.js"),
  ])

  const installEl = document.createElement("div")
  installEl.ariaHidden = "true"
  biosEl.append(installEl)

  const queueInstallLog = []

  const undones = []

  for await (const { name, size, file, mtime } of tarball.body.pipeThrough(
    tarExtractPipe({ gzip: true }),
  )) {
    let type = "application/octet-stream"

    const ext = getExtname(name)
    const filetype = extnames[ext]

    if (filetype) {
      type =
        filetype.mimetype +
        (filetype.charset ? `; charset=${filetype.charset}` : "")
    }

    const headers = {
      "Accept-Ranges": "bytes",
      "Content-Type": type,
      "Content-Length": size,
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    }
    if (mtime) headers["Last-Modified"] = new Date(mtime).toUTCString()
    const res = new Response(file, { headers })
    undones.push(
      cache.put(name, res).then(() => {
        queueInstallLog.push(`Load module: ${name}`)
      }),
    )
  }

  await Promise.all(undones)

  if (options?.splash === false) {
    if (hasCaches) location.href = location.pathname
  } else {
    for (let i = 0, l = queueInstallLog.length; i < l; i++) {
      const item = queueInstallLog[i]
      if (i % 20 === 0) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve()))
      }
      installEl.textContent = item
    }
    installEl.remove()

    if (hasCaches) location.href = location.pathname
  }
}

async function ensureCache(res, options) {
  const hasCaches = (await caches.keys()).length > 0

  const lastModified = new Date(res.headers.get("Last-Modified"))
  const revision = getSortableDateTime(lastModified)

  if (await caches.has(revision)) {
    log(`Cache Version: ${revision}\n`)
    await client.connect({ sync: false })
  } else {
    log(
      `${
        hasCaches //
          ? "New Cache Version"
          : "Install Cache Version"
      }: ${revision}\n`,
    )
    caches.keys().then((keys) => {
      for (const key of keys) caches.delete(key)
    })
    return Promise.all([
      client.connect({ sync: false }), //
      installCache(revision, hasCaches, options),
    ])
  }
}

async function fetchCache(options) {
  return null;
}

const undones = []

async function startDesktop(options) {
  if (options?.splash !== false) {
    undones.push(
      import("./splash.js") //
        .then((m) => m.splash(log, logError))
        .catch((err) => logError(err)),
    )
  }

  requestIdleCallback(() => {
    import("../desktop.js")
  })
}

export async function boot(options) {
  if (navigator.onLine) {
    await fetchCache(options).catch((err) => bios.traceError(err))
  }

  if (desktop) {
    desktop.loaded = async () => {
      const [iframeEL] = await Promise.all(undones)
      await desktop.removeBoot()
      iframeEL?.remove()
    }
  }

  return startDesktop(options)
}
