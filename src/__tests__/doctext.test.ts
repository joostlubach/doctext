import { mapValues } from 'lodash'

import DoctextReader from '../DoctextReader'
import {
  InvalidEntity,
  ObjectLiteralNotFound,
  ReferencedKeyNotFound,
  UnknownEntity,
} from '../errors'

describe("doctext", () => {

  describe("basic operation", () => {

    it("should parse doctext in an object literal", () => {
      const reader = DoctextReader.create()
      const result = reader.readSync({
        /** Foo. */
        foo: 'foo',
        /// Bar.
        bar: 'bar',

        /**
         * Baz.
         * Baz.
         */
        baz: 'baz',

        /// Qux.
        /// Qux.
        qux: 'qux',
      })

      expect(result.matched).toEqual({
        foo: {
          summary:  "Foo.",
          body:     "Foo.",
          lineno:   expect.any(Number), // Let's not assume we will not insert lines in this very file.
          entities: {},
          nodes:    expect.any(Array),
        },
        bar: {
          summary:  "Bar.",
          body:     "Bar.",
          lineno:   expect.any(Number),
          entities: {},
          nodes:    expect.any(Array),
        },
        baz: {
          summary:  "Baz. Baz.",
          body:     "Baz. Baz.",
          lineno:   expect.any(Number),
          entities: {},
          nodes:    expect.any(Array),
        },
        qux: {
          summary:  "Qux. Qux.",
          body:     "Qux. Qux.",
          lineno:   expect.any(Number),
          entities: {},
          nodes:    expect.any(Array),
        },
      })
    })

    it("should interpret everything up to a full blank line as a summary", () => {
      const result = DoctextReader.create().readSync({
        /// Foo.
        ///
        /// Foo bar baz qux.
        foo: 'foo',
      })

      expect(result.matched.foo).toEqual(expect.objectContaining({
        summary: "Foo.",
        body:    "Foo. Foo bar baz qux.",
      }))
    })

    it("should allow for an empty body", async () => {
      const result = DoctextReader.create().readSync({
        ///
        foo: 'foo',
      })

      expect(result.matched.foo).toEqual(expect.objectContaining({
        summary:  '',
        body:     '',
        entities: {},
      }))
    })
    

    it("should allow configuring markers", () => {
      const reader = DoctextReader.create({
        marker: '"""',
      })
      const result = reader.readSync({
        /** Will not work anymore. */
        foo: 'foo',
        /* """Will work.""" */
        bar: 'bar',
        // """Will work too.
        baz: 'baz',
      })

      expect(mapValues(result.matched, it => it.body)).toEqual({
        bar: "Will work.",
        baz: "Will work too.",
      })
    })

    it("should include a list of undocumented keys", () => {
      const result = DoctextReader.create().readSync({
        /** Foo. */
        foo: 'foo',
        bar: 'bar',
        /** Baz. */
        baz: 'baz',
        qux: 'qux',
      })

      expect(result.undocumentedKeys).toEqual(['bar', 'qux'])
    })

    it("should return an array of doctexts which weren't able to be matched to a key", () => {
      const result = DoctextReader.create().readSync({
        /** Hello! */

        /** Foo. */
        foo: 'foo',

        /// What's this now?

        /// Bar.
        bar: 'bar',

      })

      expect(result.unmatched.map(it => it.body)).toEqual([
        "Hello!",
        "What's this now?",
      ])
    })

    it("should allow using '---' to mark that the doctext is a separate doctext in case of confusion", () => {
      const result = DoctextReader.create().readSync({
        /**
         * I am an overall body of this object, _not_ a body of the `foo` property.
         * ---
         */
        foo: 'foo',

        /// I do belong to bar.
        bar: 'bar',
      })

      expect(mapValues(result.matched, it => it.body)).toEqual({
        bar: "I do belong to bar.",
      })

      expect(result.unmatched.map(it => it.body)).toEqual([
        "I am an overall body of this object, _not_ a body of the `foo` property.",
      ])
    })

  })

  describe("default entities", () => {

    describe("@link", () => {

      it("should allow adding links", () => {
        const result = DoctextReader.create().readSync({
          /**
           * Foo.
           * 
           * @link https://example1.com
           * @link https://example2.com Custom caption
           * @link https://example3.com
           *   Caption on new line.
           */
          foo: 'foo',
        })

        expect(result.matched.foo).toEqual(expect.objectContaining({
          entities: {
            links: [
              {href: "https://example1.com", caption: "https://example1.com"},
              {href: "https://example2.com", caption: "Custom caption"},
              {href: "https://example3.com", caption: "Caption on new line."},
            ],
          },
        }))
      })

    })

    describe("@copy", () => {

      it("should allow copying from another doctext", () => {
        const result = DoctextReader.create().readSync({
          /**
           * @copy foo
           */
          bar: 'bar',

          /**
           * Foo.
           * 
           * @link https://example.com
           */
          foo: 'foo',
        })

        expect(result.matched.foo).toEqual(expect.objectContaining({
          summary:  "Foo.",
          body:     "Foo.",
          entities: {links: [{href: "https://example.com", caption: "https://example.com"}]},
        }))
        expect(result.matched.bar).toEqual(expect.objectContaining({
          summary:  "Foo.",
          body:     "Foo.",
          entities: {links: [{href: "https://example.com", caption: "https://example.com"}]},
        }))
      })

      it("should complain if the referenced doctext does not exist", () => {
        expect(() => {
          DoctextReader.create().readSync({
            /**
             * @copy foo
             */
            bar: 'bar',
          })
        }).toThrowError(ReferencedKeyNotFound)
      })

    })

    describe("@property", () => {

      it("should interpret the property as a nested property if it is assigned to a property", () => {
        const result = DoctextReader.create().readSync({
          /**
           * Foo.
           * @property bar
           *   Foobar.
           *   
           *   Foobar also exists.
           */
          foo: 'foo',
        })

        expect(result.matched).toEqual({
          'foo': expect.objectContaining({
            summary: "Foo.",
          }),
          'foo.bar': expect.objectContaining({
            summary: "Foobar.",
            body:    "Foobar. Foobar also exists.",
          }),
        })
      })

      it("should allow specifying summary and body for any property if it's a separate doctext", () => {
        const result = DoctextReader.create().readSync({
          /**
           * @property foo.bar.baz
           *   Foobarbaz.
           *   
           *   Foobarbaz also exists.
           * ---
           */
          foo: 'foo',
        })

        expect(result.matched).toEqual({
          'foo.bar.baz': expect.objectContaining({
            summary: "Foobarbaz.",
            body:    "Foobarbaz. Foobarbaz also exists.",
          }),
        })
      })

    })

    it("should parse entities and leave all other lines for the summary and body", async () => {
      const doctext = DoctextReader.create().readSync({
        /// Summary
        /// @property name
        /// @link https://example.com Caption
        ///
        /// Description
        foo: 'foo',
      }).matched.foo

      expect(doctext).toEqual(expect.objectContaining({
        summary:  'Summary',
        body:     'Summary Description',
        entities: {
          properties: {name: expect.any(Object)},
          links:      [{href: 'https://example.com', caption: "Caption"}],
        },
      }))
    })
    
    it("should interpret indented lines below entities as entity content", async () => {
      const doctext = DoctextReader.create().readSync({
        /// Summary
        /// @link https://example.com
        ///
        ///   Description
        foo: 'foo',
      }).matched.foo

      expect(doctext).toEqual(expect.objectContaining({
        summary:  'Summary',
        body:     'Summary',
        entities: {
          links: [{href: 'https://example.com', caption: "Description"}],
        },
      }))
    })
    
    it("should interpret any other indented lines as other lines", async () => {
      const doctext = DoctextReader.create().readSync({
        /// Summary
        ///   Indented line
        /// @link https://example.com Caption
        foo: 'foo',
      }).matched.foo

      expect(doctext).toEqual(expect.objectContaining({
        summary:  'Summary Indented line',
        body:     'Summary Indented line',
        entities: {
          links: [{href: 'https://example.com', caption: "Caption"}],
        },
      }))
    })
    
    it("should throw an error on unknown entities", () => {
      expect(() => {
        DoctextReader.create().readSync({
          /**
           * @doesnotexist
           */
          foo: 'foo',
        })
      }).toThrowError(UnknownEntity)
    })

    it("should throw an error on invalidly specified entities", () => {
      expect(() => {
        DoctextReader.create().readSync({
          /**
           * Missing link URL:
           * @link
           */
          foo: 'foo',
        })
      }).toThrowError(InvalidEntity)

      expect(() => {
        DoctextReader.create().readSync({
          /**
           * Content for @copy entity.
           * @copy foo.bar What does this mean?
           */
          foo: 'foo',
        })
      }).toThrowError(InvalidEntity)
    })

  })

  describe("custom entities", () => {

    it("should allow adding a custom entity", () => {
      const reader = DoctextReader.createWithEntities<{
        custom:       string
        customBody:   string
        twoArgs:      string[]
        nestedBody:   string
        nestedValues: string[]
      }>({
        custom: {
          args:    1,
          content: true,
          add:     (entities, args, lines, util) => {
            entities.custom = args[0]
            entities.customBody = util.body(lines)
          },
        },
        twoArgs: {
          args:    2,
          content: false,
          add:     (entities, args) => {
            entities.twoArgs = args
          },
        },
        nestedValues: {
          args:    0,
          content: true,

          add: (entities, args, lines, util) => {
            entities.nestedBody = util.body(lines, true)
            entities.nestedValues = util.entities(lines, 'value')          
          },
        },
      })

      const result = reader.readSync({
        /**
         * Foo
         * @custom my-custom-arg Custom content.
         * @twoArgs arg1 arg2
         * @nestedValues
         *   This has nested values.
         *   @value This is value 1
         *   @value This is value 2
         *   @value
         *     This is value 3.
         */
        foo: 'foo',
      })

      expect(result.matched.foo.entities).toEqual({
        custom:       "my-custom-arg",
        customBody:   "Custom content.",
        twoArgs:      ["arg1", "arg2"],
        nestedBody:   "This has nested values.",
        nestedValues: ["This is value 1", "This is value 2", "This is value 3."],
      })
    })

  })

  describe("invalid usage", () => {

    it("should throw an error if the function was not called with an object literal", async () => {
      const obj = {
        foo: 'foo',
        bar: 'bar',
      }

      expect(() => {
        const reader = DoctextReader.create()
        reader.readSync(obj)
      }).toThrowError(ObjectLiteralNotFound)
    })
    
  })

})
