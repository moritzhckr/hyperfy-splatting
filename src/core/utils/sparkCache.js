/**
 * Singleton utility for Spark.js import caching
 */

let sparkModulePromise = null

/**
 * Get Spark.js module with caching to avoid multiple dynamic imports
 * @returns {Promise<Object>} - Promise that resolves to Spark.js module
 */
export async function getSparkModule() {
  if (!sparkModulePromise) {
    sparkModulePromise = import('@sparkjsdev/spark')
  }
  
  return sparkModulePromise
}

/**
 * Reset the cached Spark.js module (for testing purposes)
 */
export function resetSparkModuleCache() {
  sparkModulePromise = null
}