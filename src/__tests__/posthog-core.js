import { PostHogLib } from '../posthog-core'
import { _ } from '../utils'

describe('_calculate_event_properties()', () => {
    given('subject', () =>
        given.posthog._calculate_event_properties(given.event_name, given.properties, given.start_timestamp)
    )

    given('event_name', () => 'custom_event')
    given('properties', () => ({ event: 'prop' }))

    given('posthog', () => new PostHogLib())
    given('config', () => ({
        token: 'testtoken',
        property_blacklist: given.property_blacklist,
        sanitize_properties: given.sanitize_properties,
    }))

    beforeEach(() => {
        jest.spyOn(_.info, 'properties').mockReturnValue({ $lib: 'web' })

        given.posthog.get_config = (key) => given.config[key]

        given.posthog.persistence = {}
        given.posthog.persistence.properties = () => ({ persistent: 'prop' })
    })

    it('returns calculated properties', () => {
        expect(given.subject).toEqual({
            token: 'testtoken',
            event: 'prop',
            $lib: 'web',
            persistent: 'prop',
        })
    })

    it('respects property_blacklist', () => {
        given('property_blacklist', () => ['$lib', 'persistent'])

        expect(given.subject).toEqual({
            token: 'testtoken',
            event: 'prop',
        })
    })

    it('calls sanitize_properties', () => {
        given('sanitize_properties', () => (props, event_name) => ({ token: props.token, event_name }))

        expect(given.subject).toEqual({
            event_name: given.event_name,
            token: 'testtoken',
        })
    })
})
