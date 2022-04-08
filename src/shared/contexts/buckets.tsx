// Libraries
import React, {FC, createContext, useEffect, useMemo, useRef} from 'react'
import {createLocalStorageStateHook} from 'use-local-storage-state'

// Contexts
import {CLOUD} from 'src/shared/constants'

// Types
import {Bucket, RemoteDataState} from 'src/types'
import {QueryScope} from 'src/types/flows'

interface BucketContextType {
  loading: RemoteDataState
  buckets: Bucket[]
  addBucket: (_: Bucket) => void
  createBucket: (_: Bucket) => void
  refresh: () => void
}

const DEFAULT_CONTEXT: BucketContextType = {
  loading: RemoteDataState.NotStarted,
  buckets: [],
  addBucket: (_: Bucket) => {},
  createBucket: (_: Bucket) => {},
  refresh: () => {},
}

export const BucketContext = createContext<BucketContextType>(DEFAULT_CONTEXT)

const useLocalStorageState = createLocalStorageStateHook('buckets', {})

interface Props {
  scope: QueryScope
}

export const BucketProvider: FC<Props> = ({children, scope}) => {
  const cacheKey = `${scope.region};;<${scope.org}>`
  const [bucketCache, setBucketCache] = useLocalStorageState()
  const buckets = bucketCache[cacheKey]?.buckets ?? []
  const loading = bucketCache[cacheKey]?.loading ?? RemoteDataState.NotStarted
  const controller = useRef<AbortController>(null)

  useEffect(() => {
    if (controller.current) {
      return () => {
        try {
          // Cancelling active query so that there's no memory leak in this component when unmounting
          controller.current.abort()
        } catch (e) {
          // Do nothing
        }
      }
    }
  }, [controller])

  // TODO: load bucket creation limits on org change
  // expose limits to frontend

  const updateCache = (update: any): void => {
    bucketCache[cacheKey] = {
      ...bucketCache[cacheKey],
      ...update,
    }
    setBucketCache({
      ...bucketCache,
    })
  }

  const fetchBuckets = () => {
    if (controller.current) {
      controller.current.abort()
      controller.current = null
    } else {
      controller.current = new AbortController()
    }

    updateCache({
      loading: RemoteDataState.Loading,
    })

    const headers = {
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip',
    }

    if (scope?.token) {
      headers['Authorization'] = `Token ${scope.token}`
    }

    fetch(
      `${scope?.region}/api/v2/buckets?limit=${CLOUD ? -1 : 100}&orgID=${
        scope?.org
      }`,
      {
        method: 'GET',
        headers,
        signal: controller.current.signal,
      }
    )
      .then(response => {
        return response.json()
      })
      .then(response => {
        controller.current = null
        const bucks = response.buckets
          .map(bucket => ({
            id: bucket.id,
            orgID: bucket.orgID,
            type: bucket.type,
            name: bucket.name,
          }))
          .reduce(
            (acc, curr) => {
              if (curr.type === 'system') {
                acc.system.push(curr)
              } else {
                acc.user.push(curr)
              }
              return acc
            },
            {
              system: [],
              user: [],
              sample: [
                {
                  type: 'sample',
                  name: 'Air Sensor Data',
                  id: 'airSensor',
                },
                {
                  type: 'sample',
                  name: 'Coinbase bitcoin price',
                  id: 'bitcoin',
                },
                {
                  type: 'sample',
                  name: 'NOAA National Buoy Data',
                  id: 'noaa',
                },
                {
                  type: 'sample',
                  name: 'USGS Earthquakes',
                  id: 'usgs',
                },
              ],
            }
          )

        bucks.system.sort((a, b) =>
          `${a.name}`.toLowerCase().localeCompare(`${b.name}`.toLowerCase())
        )
        bucks.user.sort((a, b) =>
          `${a.name}`.toLowerCase().localeCompare(`${b.name}`.toLowerCase())
        )
        bucks.sample.sort((a, b) =>
          `${a.name}`.toLowerCase().localeCompare(`${b.name}`.toLowerCase())
        )
        updateCache({
          loading: RemoteDataState.Done,
          buckets: [...bucks.user, ...bucks.system, ...bucks.sample],
        })
      })
      .catch(() => {
        controller.current = null
        updateCache({
          loading: RemoteDataState.Error,
        })
      })
  }

  // make sure to fetch buckets on mount
  useEffect(() => {
    if (loading !== RemoteDataState.NotStarted) {
      return
    }

    fetchBuckets()
  }, [loading])

  const createBucket = (bucket: Bucket) => {
    bucket.orgID = scope.org

    const headers = {
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip',
    }

    if (scope?.token) {
      headers['Authorization'] = `Token ${scope.token}`
    }

    fetch(`${scope?.region}/api/v2/buckets`, {
      method: 'POST',
      headers,
      body: JSON.stringify(bucket),
    })
      .then(response => {
        return response.json()
      })
      .then(response => {
        addBucket(response)
      })
  }
  const addBucket = (bucket: Bucket) => {
    updateCache({buckets: [...buckets, bucket]})
  }

  const refresh = () => {
    fetchBuckets()
  }

  return useMemo(
    () => (
      <BucketContext.Provider
        value={{loading, buckets, createBucket, addBucket, refresh}}
      >
        {children}
      </BucketContext.Provider>
    ),
    [loading, buckets]
  )
}
