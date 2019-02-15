'use strict'

const http = require('http')
const {
  getReleaseList,
  latestByChannel,
  requestHandler,
  simpleGet
} = require('./index')
const repo = `doesdev/oneclick-release-test`
const fullUrlRepo = `https://github.com/doesdev/oneclick-release-test`
const colorReset = `\u001b[0m`
const colorGreen = `\u001b[32m`
const verbose = true

let secrets
try {
  secrets = require('./secrets.json')
} catch (ex) {
  const err = `Tests require secrets.json file with private repo and token`
  console.error(err)
  process.exit(1)
}
const publicConfig = { repo, token: secrets.token }
const fullUrlConfig = (c) => Object.assign({}, c, { repo: fullUrlRepo })

const start = (msg) => process.stdout.write(`${msg}\n`)

const finish = () => {
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  process.stdout.write(`${colorGreen}All ${run} tests passed${colorReset}\n`)
}

let run = 0
const fail = (err) => {
  process.stdout.write(`${colorReset}\n`)
  console.error(err instanceof Error ? err : new Error(`Fail: ${err}`))
  return process.exit(1)
}

const test = (msg, isTruthyOrCompA, compB) => {
  run++

  if (compB !== undefined && isTruthyOrCompA !== compB) {
    msg += `\n${isTruthyOrCompA} !== ${compB}`
    isTruthyOrCompA = false
  }

  if (!isTruthyOrCompA) return fail(msg)

  if (verbose) {
    process.stdout.write(`${colorGreen}Passed:${colorReset} ${msg}\n`)
  } else {
    process.stdout.clearLine()
    process.stdout.cursorTo(0)
    process.stdout.write(`${colorGreen}${run} test have passed${colorReset}`)
  }
  return true
}

const testAsync = async (msg, promise) => {
  try {
    test(msg, await promise())
  } catch (ex) {
    return fail(ex)
  }
}

const runTests = async () => {
  start('Starting oneclick-update tests')

  for (const type of ['public', 'private']) {
    const isPublic = type === 'public'
    const config = isPublic ? publicConfig : secrets
    const metaChannel = isPublic ? 'vendor-a' : null
    const preChannel = isPublic ? 'prerelease' : null

    test(`[${type}] getReleaseList gets list of recent releases`,
      Array.isArray(await getReleaseList(config))
    )

    test(`[${type}] getReleaseList strips github url from repo`,
      Array.isArray(await getReleaseList(fullUrlConfig(config)))
    )

    await testAsync(`[${type}] latestByChannel`, async () => {
      const result = await latestByChannel(config)

      test(`[${type}] channels are of expected type`, typeof result, 'object')

      if (metaChannel) {
        test(`[${type}] channel parsed from build metadata exists`,
          result[metaChannel].channel,
          metaChannel
        )
      }

      if (preChannel) {
        test(`[${type}] prerelease channel exists`,
          result[preChannel].channel,
          preChannel
        )
      }

      return true
    })

    const getServerResponse = async (action, channel, platform, redirect) => {
      const server = http.createServer(await requestHandler(config))
      await new Promise((resolve, reject) => server.listen(resolve))
      const port = server.address().port
      const ch = channel ? `/${channel}` : ''
      const url = `http://localhost:${port}/${action}${ch}/${platform}`
      const result = await simpleGet(url, { redirect })

      server.unref()

      return result
    }

    const testPlatformDownload = async (platform, expectNoContent) => {
      const host = isPublic ? 'github.com' : 'amazonaws.com'
      const result = await getServerResponse('download', null, platform, false)

      if (expectNoContent) {
        return test(`[${type}] download expecting no content for ${platform}`,
          result.statusCode,
          204
        )
      }

      test(`[${type}] download for ${platform} redirects with 302`,
        result.statusCode,
        302
      )

      test(`[${type}] download for ${platform} redirects to ${host}`,
        (new URL(result.headers.location)).hostname.slice(-host.length),
        host
      )

      return true
    }

    await testAsync(`[${type}] requestHandler download/win32`, () => {
      return testPlatformDownload('win32')
    })

    await testAsync(`[${type}] requestHandler download/darwin`, () => {
      return testPlatformDownload('darwin')
    })

    await testAsync(`[${type}] download fails with no content`, () => {
      return testPlatformDownload('notaplatform', true)
    })

    const testPlatformUpdate = async (platform, expectNoContent) => {
      const { serverUrl } = config
      const host = isPublic ? 'github.com' : (new URL(serverUrl)).hostname
      const result = await getServerResponse('update', null, platform)
      const { data } = result

      if (expectNoContent) {
        return test(`[${type}] update expecting no content for ${platform}`,
          result.statusCode,
          204
        )
      }

      test(`[${type}] update for ${platform} contains name`,
        typeof data.name,
        'string'
      )

      test(`[${type}] update for ${platform} contains expected url`,
        typeof data.name,
        'string'
      )

      test(`[${type}] update for ${platform} contains expected url`,
        (new URL(data.url)).hostname.slice(-host.length),
        host
      )

      return true
    }

    await testAsync(`[${type}] requestHandler update/win32`, () => {
      return testPlatformUpdate('win32')
    })

    await testAsync(`[${type}] requestHandler update/darwin`, () => {
      return testPlatformUpdate('darwin')
    })

    await testAsync(`[${type}] update fails with no content`, () => {
      return testPlatformUpdate('notaplatform', true)
    })
  }

  finish()
}

runTests().catch(fail)
