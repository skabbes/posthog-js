import { PostHogLib } from '../posthog-core'
import { CaptureMetrics } from '../capture-metrics'
import { _ } from '../utils'
import { autocapture } from '../autocapture'

given('lib', () => Object.assign(new PostHogLib(), given.overrides))

describe('identify()', () => {
    given('subject', () => () =>
        given.lib.identify(given.identity, given.userPropertiesToSet, given.userPropertiesToSetOnce)
    )

    given('identity', () => 'a-new-id')

    given('overrides', () => ({
        get_distinct_id: () => given.oldIdentity,
        capture: jest.fn(),
        register: jest.fn(),
        register_once: jest.fn(),
        unregister: jest.fn(),
        get_property: () => given.deviceId,
        people: {
            set: jest.fn(),
            set_once: jest.fn(),
        },
        _flags: {},
        _captureMetrics: {
            incr: jest.fn(),
        },
        reloadFeatureFlags: jest.fn(),
    }))

    given('properties', () => ({ $device_id: '123', __alias: 'efg' }))
    given('oldIdentity', () => 'oldIdentity')
    given('deviceId', () => given.oldIdentity)

    it('registers new user id and updates alias', () => {
        given.subject()

        expect(given.overrides.register).toHaveBeenCalledWith({ $user_id: 'a-new-id' })
        expect(given.overrides.register).toHaveBeenCalledWith({ distinct_id: 'a-new-id' })
    })

    it('calls capture when identity changes', () => {
        given.subject()

        expect(given.overrides.capture).toHaveBeenCalledWith(
            '$identify',
            {
                distinct_id: 'a-new-id',
                $anon_distinct_id: 'oldIdentity',
            },
            { $set: {} },
            { $set_once: {} }
        )
        expect(given.overrides.people.set).not.toHaveBeenCalled()
    })

    it('calls capture when identity changes and old ID is anonymous', () => {
        given('deviceId', () => null)

        given.subject()

        expect(given.overrides.capture).toHaveBeenCalledWith(
            '$identify',
            {
                distinct_id: 'a-new-id',
                $anon_distinct_id: 'oldIdentity',
            },
            { $set: {} },
            { $set_once: {} }
        )
        expect(given.overrides.people.set).not.toHaveBeenCalled()
    })

    it("don't identify if the old id isn't anonymous", () => {
        given('deviceId', () => 'anonymous-id')

        given.subject()

        expect(given.overrides.capture).not.toHaveBeenCalled()
        expect(given.overrides.people.set).not.toHaveBeenCalled()
    })

    it('calls capture with user properties if passed', () => {
        given('userPropertiesToSet', () => ({ email: 'john@example.com' }))
        given('userPropertiesToSetOnce', () => ({ howOftenAmISet: 'once!' }))

        given.subject()

        expect(given.overrides.capture).toHaveBeenCalledWith(
            '$identify',
            {
                distinct_id: 'a-new-id',
                $anon_distinct_id: 'oldIdentity',
            },
            { $set: { email: 'john@example.com' } },
            { $set_once: { howOftenAmISet: 'once!' } }
        )
    })

    describe('identity did not change', () => {
        given('oldIdentity', () => given.identity)

        it('does not capture or set user properties', () => {
            given.subject()

            expect(given.overrides.capture).not.toHaveBeenCalled()
            expect(given.overrides.people.set).not.toHaveBeenCalled()
        })

        it('calls people.set when user properties passed', () => {
            given('userPropertiesToSet', () => ({ email: 'john@example.com' }))
            given('userPropertiesToSetOnce', () => ({ howOftenAmISet: 'once!' }))

            given.subject()

            expect(given.overrides.capture).not.toHaveBeenCalled()
            expect(given.overrides.people.set).toHaveBeenCalledWith({ email: 'john@example.com' })
            expect(given.overrides.people.set_once).toHaveBeenCalledWith({ howOftenAmISet: 'once!' })
        })
    })

    describe('invalid id passed', () => {
        given('identity', () => null)

        it('does not update user', () => {
            given.subject()

            expect(given.overrides.capture).not.toHaveBeenCalled()
            expect(given.overrides.register).not.toHaveBeenCalled()
        })
    })
})

describe('capture()', () => {
    given('eventName', () => '$event')

    given('subject', () => () =>
        given.lib.capture(given.eventName, given.eventProperties, given.options, given.callback)
    )

    given('overrides', () => ({
        __loaded: true,
        get_config: (key) => given.config?.[key],
        config: {
            _onCapture: jest.fn(),
        },
        persistence: {
            remove_event_timer: jest.fn(),
            update_search_keyword: jest.fn(),
            update_campaign_params: jest.fn(),
            properties: jest.fn(),
        },
        compression: {},
        _captureMetrics: new CaptureMetrics(),
        __captureHooks: [],
    }))

    it('handles recursive objects', () => {
        given('eventProperties', () => {
            const props = {}
            props.recurse = props
            return props
        })

        expect(() => given.subject()).not.toThrow()
    })

    it('calls callbacks added via _addCaptureHook', () => {
        const hook = jest.fn()

        given.lib._addCaptureHook(hook)

        given.subject()

        expect(hook).toHaveBeenCalledWith('$event')
    })

    it('errors with undefined event name', () => {
        given('eventName', () => undefined)

        const hook = jest.fn()
        given.lib._addCaptureHook(hook)

        expect(() => given.subject()).not.toThrow()
        expect(hook).not.toHaveBeenCalled()
    })

    it('errors with object event name', () => {
        given('eventName', () => ({ event: 'object as name' }))

        const hook = jest.fn()
        given.lib._addCaptureHook(hook)

        expect(() => given.subject()).not.toThrow()
        expect(hook).not.toHaveBeenCalled()
    })

    it('truncates long properties', () => {
        given('config', () => ({
            properties_string_max_length: 1000,
        }))
        given('eventProperties', () => ({
            key: 'value'.repeat(10000),
        }))
        const event = given.subject()
        expect(event.properties.key.length).toBe(1000)
    })

    it('keeps long properties if null', () => {
        given('config', () => ({
            properties_string_max_length: null,
        }))
        given('eventProperties', () => ({
            key: 'value'.repeat(10000),
        }))
        const event = given.subject()
        expect(event.properties.key.length).toBe(50000)
    })
})

describe('_calculate_event_properties()', () => {
    given('subject', () =>
        given.lib._calculate_event_properties(given.event_name, given.properties, given.start_timestamp)
    )

    given('event_name', () => 'custom_event')
    given('properties', () => ({ event: 'prop' }))

    given('overrides', () => ({
        get_config: (key) => given.config[key],
        persistence: {
            properties: () => ({ distinct_id: 'abc', persistent: 'prop' }),
        },
    }))

    given('config', () => ({
        token: 'testtoken',
        property_blacklist: given.property_blacklist,
        sanitize_properties: given.sanitize_properties,
    }))

    beforeEach(() => {
        jest.spyOn(_.info, 'properties').mockReturnValue({ $lib: 'web' })
    })

    it('returns calculated properties', () => {
        expect(given.subject).toEqual({
            token: 'testtoken',
            event: 'prop',
            $lib: 'web',
            distinct_id: 'abc',
            persistent: 'prop',
        })
    })

    it('respects property_blacklist', () => {
        given('property_blacklist', () => ['$lib', 'persistent'])

        expect(given.subject).toEqual({
            token: 'testtoken',
            event: 'prop',
            distinct_id: 'abc',
        })
    })

    it('calls sanitize_properties', () => {
        given('sanitize_properties', () => (props, event_name) => ({ token: props.token, event_name }))

        expect(given.subject).toEqual({
            event_name: given.event_name,
            token: 'testtoken',
        })
    })

    it('saves $snapshot data and token for $snapshot events', () => {
        given('event_name', () => '$snapshot')
        given('properties', () => ({ $snapshot_data: {} }))

        expect(given.subject).toEqual({
            token: 'testtoken',
            $snapshot_data: {},
            distinct_id: 'abc',
        })
    })
})

describe('_handle_unload()', () => {
    given('subject', () => () => given.lib._handle_unload())

    given('overrides', () => ({
        get_config: (key) => given.config[key],
        capture: jest.fn(),
        compression: {},
        _requestQueue: {
            unload: jest.fn(),
        },
        _retryQueue: {
            unload: jest.fn(),
        },
    }))

    given('config', () => ({
        capture_pageview: given.capturePageviews,
        request_batching: given.batching,
    }))

    given('capturePageviews', () => true)
    given('batching', () => true)

    it('captures $pageleave', () => {
        given.subject()

        expect(given.overrides.capture).toHaveBeenCalledWith('$pageleave')
    })

    it('does not capture $pageleave when capture_pageview=false', () => {
        given('capturePageviews', () => false)

        given.subject()

        expect(given.overrides.capture).not.toHaveBeenCalled()
    })

    it('calls requestQueue unload', () => {
        given.subject()

        expect(given.overrides._requestQueue.unload).toHaveBeenCalledTimes(1)
    })

    describe('without batching', () => {
        given('batching', () => false)

        it('captures $pageleave', () => {
            given.subject()

            expect(given.overrides.capture).toHaveBeenCalledWith('$pageleave', null, { transport: 'sendbeacon' })
        })

        it('does not capture $pageleave when capture_pageview=false', () => {
            given('capturePageviews', () => false)

            given.subject()

            expect(given.overrides.capture).not.toHaveBeenCalled()
        })
    })
})

describe('__compress_and_send_json_request', () => {
    given('subject', () => () =>
        given.lib.__compress_and_send_json_request('/e/', given.jsonData, given.options, jest.fn())
    )

    given('jsonData', () => JSON.stringify({ large_key: new Array(500).join('abc') }))

    given('overrides', () => ({
        compression: {},
        _send_request: jest.fn(),
        get_config: () => false,
    }))

    it('handles base64 compression', () => {
        given('compression', () => ({}))

        given.subject()

        expect(given.overrides._send_request.mock.calls).toMatchSnapshot()
    })
})

describe('init()', () => {
    given('subject', () => () => given.lib.init())

    given('overrides', () => ({
        get_distinct_id: () => 'distinct_id_987',
        advanced_disable_decide: given.advanced_disable_decide,
        _send_request: jest.fn(),
        capture: jest.fn(),
    }))

    beforeEach(() => {
        jest.spyOn(window.console, 'warn').mockImplementation()
        jest.spyOn(autocapture, 'init').mockImplementation()
        jest.spyOn(autocapture, 'afterDecideResponse').mockImplementation()
    })

    given('advanced_disable_decide', () => true)

    it('does not load decide enpoint on advanced_disable_decide', () => {
        given.subject()
        expect(given.decide).toBe(undefined)
        expect(given.overrides._send_request.mock.calls.length).toBe(0) // No outgoing requests
    })

    it('does not load autocapture, feature flags, toolbar, session recording or compression', () => {
        given('overrides', () => {
            return {
                sessionRecording: {
                    afterDecideResponse: jest.fn(),
                },
                toolbar: {
                    afterDecideResponse: jest.fn(),
                },
                persistence: {
                    register: jest.fn(),
                },
            }
        })

        given.subject()

        jest.spyOn(given.lib.toolbar, 'afterDecideResponse').mockImplementation()
        jest.spyOn(given.lib.sessionRecording, 'afterDecideResponse').mockImplementation()
        jest.spyOn(given.lib.persistence, 'register').mockImplementation()

        // Autocapture
        expect(given.lib['__autocapture_enabled']).toBe(undefined)
        expect(autocapture.init).toHaveBeenCalledTimes(0)
        expect(autocapture.afterDecideResponse).toHaveBeenCalledTimes(0)

        // Feature flags
        expect(given.lib.persistence.register).toHaveBeenCalledTimes(0) // FFs are saved this way

        // Toolbar
        expect(given.lib.toolbar.afterDecideResponse).toHaveBeenCalledTimes(0)

        // Session recording
        expect(given.lib.sessionRecording.afterDecideResponse).toHaveBeenCalledTimes(0)

        // Compression
        expect(given.lib['compression']).toBe(undefined)
    })
})

describe('skipped init()', () => {
    it('capture() does not throw', () => {
        expect(() => given.lib.capture('$pageview')).not.toThrow()
    })
})
