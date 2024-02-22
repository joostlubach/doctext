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
          summary:     "Foo.",
          description: "Foo.",
          lineno:      expect.any(Number), // Let's not assume we will not insert lines in this very file.
          entities:    {},
          nodes:       expect.any(Array),
        },
        bar: {
          summary:     "Bar.",
          description: "Bar.",
          lineno:      expect.any(Number),
          entities:    {},
          nodes:       expect.any(Array),
        },
        baz: {
          summary:     "Baz. Baz.",
          description: "Baz. Baz.",
          lineno:      expect.any(Number),
          entities:    {},
          nodes:       expect.any(Array),
        },
        qux: {
          summary:     "Qux. Qux.",
          description: "Qux. Qux.",
          lineno:      expect.any(Number),
          entities:    {},
          nodes:       expect.any(Array),
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
        summary:     "Foo.",
        description: "Foo. Foo bar baz qux.",
      }))
    })

    it("should allow for an empty description", async () => {
      const result = DoctextReader.create().readSync({
        ///
        foo: 'foo',
      })

      expect(result.matched.foo).toEqual(expect.objectContaining({
        summary:     '',
        description: '',
        entities:    {},
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

      expect(mapValues(result.matched, it => it.description)).toEqual({
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

      expect(result.unmatched.map(it => it.description)).toEqual([
        "Hello!",
        "What's this now?",
      ])
    })

    it("should allow using '---' to mark that the doctext is a separate doctext in case of confusion", () => {
      const result = DoctextReader.create().readSync({
        /**
         * I am an overall description of this object, _not_ a description of the `foo` property.
         * ---
         */
        foo: 'foo',

        /// I do belong to bar.
        bar: 'bar',
      })

      expect(mapValues(result.matched, it => it.description)).toEqual({
        bar: "I do belong to bar.",
      })

      expect(result.unmatched.map(it => it.description)).toEqual([
        "I am an overall description of this object, _not_ a description of the `foo` property.",
      ])
    })

  })

  describe("entities", () => {

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

        expect(result.matched.bar).toEqual(expect.objectContaining({
          summary:     "Foo.",
          description: "Foo.",
          entities:    {links: [{href: "https://example.com", caption: "https://example.com"}]},
        }))
        expect(result.matched.foo).toEqual(expect.objectContaining({
          summary:     "Foo.",
          description: "Foo.",
          entities:    {links: [{href: "https://example.com", caption: "https://example.com"}]},
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
            summary:     "Foobar.",
            description: "Foobar. Foobar also exists.",
          }),
        })
      })

      it("should allow specifying summary and description for any property if it's a separate doctext", () => {
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
            summary:     "Foobarbaz.",
            description: "Foobarbaz. Foobarbaz also exists.",
          }),
        })
      })

    })

    it("should parse entities and leave all other lines for the summary and description", async () => {
      const doctext = DoctextReader.create().readSync({
        /// Summary
        /// @property name
        /// @link https://example.com Caption
        ///
        /// Description
        foo: 'foo',
      }).matched.foo

      expect(doctext).toEqual(expect.objectContaining({
        summary:     'Summary',
        description: 'Summary Description',
        entities:    {
          properties: {name: expect.any(Object)},
          links:      [{href: 'https://example.com', caption: "Caption"}],
        },
      }))
    })

    it("should not allow mixing inline and indented content", async () => {
      expect(() => {
        DoctextReader.create().readSync({
          /// Summary
          /// @property name
          /// @link https://example.com Caption
          ///
          ///   Description
          foo: 'foo',
        }).matched.foo
      }).toThrowError(InvalidEntity)
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
        summary:     'Summary',
        description: 'Summary',
        entities:    {
          links: [{href: 'https://example.com', caption: "Description"}],
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

      expect(() => {
        DoctextReader.create().readSync({
          /**
           * Content for @copy entity.
           * @copy foo.bar
           *   What does this mean?
           */
          foo: 'foo',
        })
      }).toThrowError(InvalidEntity)
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