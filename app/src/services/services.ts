import { ResourceService, ResourceServiceImpl, type ResourceServiceConfig } from './resources'
import type { AuthService } from './auth'
import { ResourceObject } from '../store/model'
import KError, { KErrorCode } from '../KError'

type ServiceType = "accounting" | "social" | "notifications"

interface ResourceTypeConfig {
  service: ServiceType
  endpoints?: ResourceServiceConfig['endpoints']
  inverseRelationships?: {
    [relationshipName: string]: {
      type: string
      relationship: string
    }
  }
}

class ResourceConfigRegistry {
  private configs = new Map<string, ResourceTypeConfig>()
  private services = new Map<string, ResourceServiceImpl<ResourceObject>>()
  private baseUrls = new Map<ServiceType, string>()
  
  private authService: AuthService | null = null

  setBaseUrl(service: ServiceType, url: string) {
    this.baseUrls.set(service, url)
    // Update existing services of this type
    for (const type of this.services.keys()) {
      const config = this.configs.get(type)
      if (config && config.service === service) {
        this.services.get(type)!.setBaseUrl(url)
      }
    }
  }

  setAuthService(authService: AuthService) {
    this.authService = authService
  }

  getAuthService() {
    return this.authService
  }

  register(type: string, service: ServiceType, config?: Omit<ResourceTypeConfig, 'service'>) {
    this.configs.set(type, {
      service,
      ...config
    })
  }

  getService<T extends ResourceObject>(type: string): ResourceService<T> {
    if (!this.services.has(type)) {
      if (!this.authService) {
        throw new KError(KErrorCode.ScriptError, 'Auth service not set in ResourceConfigRegistry')
      }
      const config = this.getConfig(type)
      const service = new ResourceServiceImpl<T>({
        type,
        baseUrl: this.baseUrls.get(config.service)!,
        authService: this.authService,
        endpoints: config.endpoints
      })
      this.services.set(type, service)
    }
    const service = this.services.get(type) as ResourceServiceImpl<T> 
    return service as ResourceService<T>
  }

  getConfig(type: string): ResourceTypeConfig {
    const config = this.configs.get(type)
    if (!config) {
      throw new KError(KErrorCode.ScriptError, `No config registered for resource type: ${type}`)
    }
    return config
  }
}

export const services = new ResourceConfigRegistry()

// A few handy exports
export const getAuthService = () => {
  const auth = services.getAuthService()
  if (auth === null) {
    throw new KError(KErrorCode.ScriptError, "Called getAuthService before initialization")
  }
  return auth
}

export const getService = <T extends ResourceObject>(type: string) => services.getService<T>(type)
