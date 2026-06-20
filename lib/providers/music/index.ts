import { MusicGenerationProvider } from "./interface"
import { MockProvider } from "./mock"
import { GenericHttpSunoProvider } from "./generic-http"
import { SunoGcuiProvider } from "./suno-gcui"
import { SunoApiOrgProvider } from "./sunoapi-org"

let provider: MusicGenerationProvider | null = null

export function getMusicProvider(): MusicGenerationProvider {
  if (!provider) {
    const type = process.env.MUSIC_PROVIDER || "mock"

    switch (type) {
      case "suno-gcui":
        provider = new SunoGcuiProvider()
        break
      case "sunoapi-org":
        provider = new SunoApiOrgProvider()
        break
      case "generic-http":
        provider = new GenericHttpSunoProvider()
        break
      case "mock":
      default:
        provider = new MockProvider()
        break
    }
  }

  return provider
}
