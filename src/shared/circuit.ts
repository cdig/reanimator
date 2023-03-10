import {
   rememberAxis,
   forgetAxis,
   Vector,
   Point,
   Rotation,
   Axis,
   Range2D,
   Rectangle,
   Range1D,
} from "~/shared/geometry"
import * as Geometry from "~/shared/geometry"
import { DefaultMap, DefaultWeakMap } from "./utilities"

let nextObjectID = 0

export type Tag = string
export const emptyTag: Tag = ""

// A property (key/value pair) has two representations: as a PropertyString and
// as a Property. The former representation is a serialized version of the
// latter. It exists so that duplicate key/value pairs are ignored when they
// are stored in a Set.
export type PropertyString = string
export class Property {
   name: string
   value: string
   constructor(name: string, value: string) {
      this.name = name
      this.value = value
   }
   serialize(): PropertyString {
      return this.name + propSeparator + this.value
   }
}
export function parseProperty(propString: PropertyString): Property {
   let i = propString.indexOf(propSeparator)
   return new Property(propString.slice(0, i), propString.slice(i + 1))
}
const propSeparator = "\\"
export let emptyPropertyString: PropertyString = propSeparator

export type Vertex = Junction | Port
export type VertexGlyphKind =
   | { type: "auto" }
   | { type: "manual"; glyph: string | null }
export function isVertex(thing: any): thing is Vertex {
   return thing instanceof Junction || thing instanceof Port
}

export interface Deletable {
   delete(): Set<Junction> // Returns all Junctions adjacent to the deleted obj.
}

export type Edge = [Segment, Vertex]
export type GlyphOrientation = "fixed" | "inherit"
export type Host = Segment | SymbolInstance | TextBox

export class Junction extends Point implements Deletable {
   static s = new Set<Junction>()
   readonly objectID: number // for serialization
   tags = new Set<Tag>()
   properties = new Set<PropertyString>()
   glyph: VertexGlyphKind = { type: "auto" }
   glyphOrientation: GlyphOrientation = "fixed"
   private readonly edges_ = new Set<Edge>()
   private host_: Host | null = null
   constructor(point: Point, addToCircuit = true) {
      super(point.x, point.y)
      this.objectID = nextObjectID++
      if (addToCircuit) Junction.s.add(this)
   }
   delete(): Set<Junction> {
      Junction.s.delete(this)
      let neighbours = new Set<Junction>()
      for (let [segment, other] of this.edges_) {
         segment.delete()
         if (other instanceof Junction) neighbours.add(other)
      }
      this.edges_.clear()
      this.detach()
      amassed.items.delete(this)
      return neighbours
   }
   moveTo(point: Point) {
      ;(this.x as number) = point.x
      ;(this.y as number) = point.y
   }
   moveBy(displacement: Vector) {
      this.moveTo(this.displacedBy(displacement))
   }
   rotateAround(point: Point, rotation: Rotation) {
      this.moveTo(this.rotatedAround(point, rotation))
   }
   edges(): Set<Edge> {
      return this.edges_
   }
   axes(): Axis[] {
      let a: Axis[] = []
      for (let [{ axis }] of this.edges_) if (!a.includes(axis)) a.push(axis)
      return a
   }
   addEdge(edge: Edge) {
      this.edges_.add(edge)
   }
   removeEdge(edge: Edge) {
      this.edges_.delete(edge)
      if (this.edges_.size === 0) this.delete()
   }
   attachTo(host: Host) {
      if (this.host_) this.detach()
      this.host_ = host
      host.attachments.add(this)
   }
   host(): Host | null {
      return this.host_
   }
   detach() {
      if (this.host_) {
         this.host_.attachments.delete(this)
         this.host_ = null
      }
   }
   // If the edges at the junction form a straight line, fuse them together.
   // If instead the junction is an X-junction, convert it to a crossing. After
   // calling this method, all references to the junction should be discarded.
   // If the edges can't be fused, calling this method will have no effect.
   fuse(): Set<Segment> | undefined {
      if (this.host() || (this.edges_.size !== 2 && this.edges_.size !== 4))
         return
      // Gather all pairs of colinear edges.
      let ax = new DefaultMap<Axis, Segment[]>(() => [])
      for (let edge of this.edges_) ax.getOrCreate(edge[0].axis).push(edge[0])
      let pairs = new Set<[Segment, Segment]>()
      for (let pair of ax.values()) {
         if (pair.length !== 2) return
         if (pair[0].type !== pair[1].type) return // can't merge diff types
         pairs.add([pair[0], pair[1]])
      }
      // Fuse each pair of segments into a single segment.
      let fusedSegments = new Set<Segment>()
      for (let [seg1, seg2] of pairs) {
         fusedSegments.add(
            Segment.byMerging(
               seg1,
               seg2,
               this === seg1.start ? seg1.end : seg1.start,
               this === seg2.start ? seg2.end : seg2.start
            )
         )
         // Get rid of the old segments.
         seg1.delete()
         seg2.delete()
      }
      this.delete()
      return fusedSegments
   }
   clone(addToCircuit = true): Junction {
      let junction = new Junction(this, addToCircuit)
      junction.tags = new Set(this.tags)
      junction.properties = new Set(this.properties)
      junction.glyph = this.glyph
      junction.glyphOrientation = this.glyphOrientation
      return junction
   }
}

export class PortKind extends Point {
   readonly svgID: string
   constructor(svgID: string, x: number, y: number) {
      super(x, y)
      this.svgID = svgID
   }
}

export class Port extends Point {
   static s = new Set<Port>()
   readonly objectID: number // for serialization
   readonly symbol: SymbolInstance
   readonly kind: PortKind
   tags = new Set<Tag>()
   properties = new Set<PropertyString>()
   glyph: VertexGlyphKind = { type: "auto" }
   glyphOrientation: GlyphOrientation = "fixed"
   private readonly edges_ = new Set<Edge>()
   constructor(
      symbol: SymbolInstance,
      kind: PortKind,
      position: Point,
      addToCircuit = true
   ) {
      super(position.x, position.y)
      this.objectID = nextObjectID++
      this.symbol = symbol
      this.kind = kind
      if (addToCircuit) Port.s.add(this)
   }
   edges(): Set<Edge> {
      return this.edges_
   }
   axes(): Axis[] {
      let a: Axis[] = []
      for (let [{ axis }] of this.edges_) if (!a.includes(axis)) a.push(axis)
      return a
   }
   addEdge(edge: Edge) {
      this.edges_.add(edge)
   }
   removeEdge(edge: Edge) {
      this.edges_.delete(edge)
   }
   // Unlike Junctions, Ports cannot have a clone() method, because a cloned
   // Port needs to belong to a different Symbol. Thus, we make it the
   // responsibility of the SymbolInstance constructor to create new Ports, and
   // we use the following method to transfer properties from existing Ports.
   copyFrom(port: Port) {
      this.tags = new Set(port.tags)
      this.properties = new Set(port.properties)
      this.glyph = port.glyph
      this.glyphOrientation = port.glyphOrientation
   }
   // This is like clone(), except it converts the Port to a Junction. We need
   // this when the Symbol that a Port belongs to is deleted.
   cloneAsJunction(addToCircuit = true): Junction {
      let junction = new Junction(this, addToCircuit)
      junction.tags = new Set(this.tags)
      junction.properties = new Set(this.properties)
      junction.glyph = this.glyph
      junction.glyphOrientation = this.glyphOrientation
      return junction
   }
}

export type LineType = {
   name: string // name of the JSON file (sans extension)
   // The remaining fields correspond to the contents of the JSON file:
   color: string // CSS color
   thickness: number // in pixels
   dasharray?: string // in the format of SVG's stroke-dasharray
   ending?: string // file path
   meeting?: {
      // "lineType" should be the file name (sans file extension) of another
      // line type, and "crossing/L/T/X" should be the file name (including file
      // extension) of the glyph that should appear when a meeting of the
      // respective type occurs. The letters L/T/X refer to the shape of the
      // intersection where the two line types meet.
      [lineType: string | symbol]: {
         attaches?: boolean
         crossing?: string // when the first line crosses over this one
         L?: string // when the two line types intersect at an L
         T?: string // when the first line type intersects this one at a T
         X?: string // when the two line types intersect at an X
      }
   }
   attachToAll?: boolean // whether to always attach to target (ie. never split)
}

const tetherLineTypeName = "tether"
export const tetherLineType: LineType = {
   name: tetherLineTypeName,
   color: "black",
   thickness: 1,
   attachToAll: true,
}

export type LineTypeConfig = {
   sidebarOrder: string[]
   selectedByDefault: string
   keyBindings: {
      [lineType: string | symbol]: string // a map from line type to key binding
   }
}

export class SpecialAttachPoint extends Point {
   readonly object: Host
   constructor(x: number, y: number, object: Host) {
      super(x, y)
      this.object = object
   }
}

export class Segment extends Geometry.LineSegment<Vertex> implements Deletable {
   static s = new Set<Segment>()
   readonly objectID: number // for serialization
   type: LineType
   tags = new Set<Tag>()
   properties = new Set<PropertyString>()
   color: string = "" // CSS color. Empty string means inherit from line type.
   isFrozen = false
   readonly crossingKinds = new DefaultWeakMap<Segment, CrossingGlyphKind>(
      () => {
         return { type: "auto" }
      }
   )
   attachments = new Set<Junction>() // should only be modified from Junction class
   private readonly edgeS: Edge
   private readonly edgeE: Edge
   constructor(
      type: LineType,
      start: Vertex,
      end: Vertex,
      axis: Axis,
      addToCircuit = true
   ) {
      super(start, end, axis)
      this.objectID = nextObjectID++
      this.type = type
      this.edgeS = [this, end]
      this.edgeE = [this, start]

      if (addToCircuit) Segment.s.add(this)
      rememberAxis(this.axis)
      this.start.addEdge(this.edgeS)
      this.end.addEdge(this.edgeE)
   }
   renderColor(): string {
      // If this.color is valid, use it. Otherwise, use this.type.color.
      let color = this.type.color
      if (this.color.length > 0) {
         // Check if this.color is a valid CSS color, using a dummy element.
         let test = new Option().style
         test.color = this.color
         if (test.color !== "") color = this.color
      }
      return color
   }
   isTether(): boolean {
      return this.type.name === tetherLineTypeName
   }
   isRigid(): boolean {
      return this.isFrozen || (this.isTether() && this.attachments.size > 0)
   }
   private cachedCenterPoint = new SpecialAttachPoint(0, 0, this)
   // A variant of center() that retains extra information.
   centerPoint(): SpecialAttachPoint {
      // The purpose of caching is to ensure that the center point has a
      // consistent object identity for as long as the segment is stationary.
      let point = this.center()
      if (point.sqDistanceFrom(this.cachedCenterPoint) !== 0)
         this.cachedCenterPoint = new SpecialAttachPoint(point.x, point.y, this)
      return this.cachedCenterPoint
   }
   updateAxis(newAxis: Axis) {
      forgetAxis(this.axis)
      ;(this.axis as Axis) = newAxis
      rememberAxis(this.axis)
   }
   delete(): Set<Junction> {
      Segment.s.delete(this)
      forgetAxis(this.axis)
      this.start.removeEdge(this.edgeS)
      this.end.removeEdge(this.edgeE)
      this.attachments.forEach((a) => a.detach())
      amassed.items.delete(this)
      let junctions = new Set<Junction>()
      if (this.start instanceof Junction) junctions.add(this.start)
      if (this.end instanceof Junction) junctions.add(this.end)
      return junctions
   }
   // Split the segment at the given vertex, which is assumed to lie on the
   // segment. The original segment is deleted, so all references to it should
   // be discarded.
   splitAt(vertex: Vertex): [Segment, Segment] {
      let slice1 = this.sliceOut(this.start, vertex)
      let slice2 = this.sliceOut(vertex, this.end)
      this.delete()
      return [slice1, slice2]
   }
   // Remove a chunk from the segment between the given vertices, which are
   // assumed to line on the segment. The original segment is deleted, so all
   // references to it should be discarded.
   spliceAt(vertices: [Vertex, Vertex]): [Segment, Segment] {
      let [v1, v2] =
         vertices[0].sqDistanceFrom(this.start) <
         vertices[1].sqDistanceFrom(this.start)
            ? [vertices[0], vertices[1]]
            : [vertices[1], vertices[0]]
      let slice1 = this.sliceOut(this.start, v1)
      let slice2 = this.sliceOut(v2, this.end)
      this.delete()
      return [slice1, slice2]
   }
   // Copy all the crossing information relating to the "source" segment to the
   // "target" segment.
   private static copyCrossings(
      source: Segment,
      target: Segment,
      allSegments: Iterable<Segment>
   ) {
      // First, check if the segments are facing in opposite directions. If they
      // are, some crossing glyphs may have to be flipped when they are copied.
      let sourceDir = source.end.displacementFrom(source.start)
      let targetDir = target.end.displacementFrom(target.start)
      let sameFacing = sourceDir.dot(targetDir) > 0
      for (let other of allSegments) {
         let c12 = source.crossingKinds.get(other)
         if (c12) {
            if (sameFacing || c12.type === "auto") {
               target.crossingKinds.set(other, c12)
            } else {
               let not = { left: "right", right: "left" } as const
               target.crossingKinds.set(other, {
                  type: "manual",
                  glyph: c12.glyph,
                  facing: not[c12.facing],
               })
            }
         }
         let c21 = other.crossingKinds.get(source)
         if (c21) other.crossingKinds.set(target, c21)
      }
   }
   // Clone the segment. This only copies the segment's "intrinsic" properties
   // — it doesn't copy the endpoint vertices. We allow the endpoint vertices
   // to be swapped out during cloning, because it's useful. But the axis of
   // the new endpoints is assumed to be the same as the original endpoints!
   clone(start = this.start, end = this.end, addToCircuit = true): Segment {
      let segment = new Segment(this.type, start, end, this.axis, addToCircuit)
      segment.tags = new Set(this.tags)
      segment.properties = new Set(this.properties)
      segment.color = this.color
      segment.isFrozen = this.isFrozen
      Segment.copyCrossings(this, segment, Segment.s)
      // Note: attachments are _intentionally_ not copied, because multiple
      // segments cannot share an attachment.
      return segment
   }
   // The following method is a variant of clone() that can be used to REPLACE
   // a segment with one or more other segments.
   // The main difference is that it transfers attachments to the new segment.
   sliceOut(start: Vertex, end: Vertex): Segment {
      let segment = this.clone(start, end)
      // Preserve selection state.
      if (amassed.items.has(this)) amassed.items.add(segment)
      // Transfer attachments that fall within the slice.
      for (let attachment of this.attachments) {
         if (attachment.projectsOnto(segment)) attachment.attachTo(segment)
      }
      return segment
   }
   // This method is similar to sliceOut(), except instead of copying properties
   // from one segment, we copy from two, and resolve conflicts where required.
   static byMerging(
      seg1: Segment,
      seg2: Segment,
      start: Vertex,
      end: Vertex
   ): Segment {
      let mergedSegment = new Segment(seg1.type, start, end, seg1.axis)
      // Merge the properties of the old segments into the new one.
      mergedSegment.tags = new Set([...seg1.tags, ...seg2.tags])
      mergedSegment.properties = new Set([
         ...seg1.properties,
         ...seg2.properties,
      ])
      mergedSegment.color = seg1.color
      mergedSegment.isFrozen = seg1.isFrozen && seg2.isFrozen
      // For each segment in the circuit that intersects seg1, use seg1's
      // crossing information. For the rest, use seg2's crossing information.
      let segmentsIntersectingSeg1 = new Set<Segment>()
      let remainingSegments = new Set<Segment>()
      for (let segment of Segment.s) {
         if (seg1.intersection(segment)) {
            segmentsIntersectingSeg1.add(segment)
         } else {
            remainingSegments.add(segment)
         }
      }
      Segment.copyCrossings(seg1, mergedSegment, segmentsIntersectingSeg1)
      Segment.copyCrossings(seg2, mergedSegment, remainingSegments)
      // Transfer selection state.
      if (amassed.items.has(seg1) || amassed.items.has(seg2))
         amassed.items.add(mergedSegment)
      // Transfer attachments.
      seg1.attachments.forEach((a) => a.attachTo(mergedSegment))
      seg2.attachments.forEach((a) => a.attachTo(mergedSegment))
      return mergedSegment
   }
}

export type CrossingGlyphKind =
   | { type: "auto" }
   | { type: "manual"; glyph: string | null; facing: "left" | "right" }
export class Crossing extends Geometry.LineSegmentCrossing<Segment> {}
export function convertToJunction(crossing: Crossing) {
   let cutPoint = new Junction(crossing.point)
   crossing.seg1.splitAt(cutPoint)
   crossing.seg2.splitAt(cutPoint)
}

export const strokeHighlightThickness = 5
export const fillHighlightThickness = 5

// A common abstraction for storing the information required to instantiate
// and highlight circuit symbols and glyphs.
export class SymbolKind {
   private static nextKindID = 0
   readonly kindID: string
   readonly fileName: string
   readonly svgTemplate: SVGElement
   readonly highlightTemplate: SVGElement
   readonly svgBox: Range2D
   readonly collisionBox: Range2D
   readonly ports: PortKind[]

   static new(fileName: string, fileContents: string): SymbolKind | undefined {
      let doc = new DOMParser().parseFromString(fileContents, "image/svg+xml")
      let svg = doc.querySelector("svg")
      if (svg instanceof SVGElement) {
         return new SymbolKind(fileName, doc, svg)
      } else {
         console.error(
            `Failed to locate an SVG element within ${fileName}.`,
            `Contents:\n${fileContents}`
         )
      }
   }
   private constructor(fileName: string, doc: Document, svg: SVGElement) {
      this.kindID = ":" + SymbolKind.nextKindID++
      this.fileName = fileName
      this.svgTemplate = svg
      this.svgTemplate.id = fileName
      this.svgTemplate.setAttribute("overflow", "visible") // don't clip
      this.svgTemplate.classList.add("svgTemplate")
      // If the SVG doesn't have a width/height, extract them from its viewBox.
      let widthAttr = svg.getAttribute("width")
      let heightAttr = svg.getAttribute("height")
      let hasWidth = widthAttr && !widthAttr.endsWith("%")
      let hasHeight = heightAttr && !heightAttr.endsWith("%")
      let viewBox = svg.getAttribute("viewBox")
      if ((!hasWidth || !hasHeight) && viewBox) {
         let [x, y, w, h] = viewBox.split(",")
         if (!w || !h) [x, y, w, h] = viewBox.split(" ")
         if (w && h) {
            svg.setAttribute("width", w.trim() + "px")
            svg.setAttribute("height", h.trim() + "px")
         }
      }
      // Add the template to the main document so its size can be measured.
      document.getElementById("symbol templates")?.appendChild(this.svgTemplate)
      // To account for "noise" in the data, we round things down to 0.5.
      function floor(x: number) {
         return Math.floor(x * 2) / 2
      }
      // Compute the bounding box of the whole SVG.
      {
         this.svgTemplate.getBoundingClientRect() // hack to fix Safari bug
         let { x, y, width, height } = this.svgTemplate.getBoundingClientRect()
         this.svgBox = Range2D.fromXY(
            new Range1D([floor(x), floor(x + width)]),
            new Range1D([floor(y), floor(y + height)])
         )
      }
      // Locate the collision box of the symbol.
      let box = this.svgTemplate.querySelector("#collisionBox")
      if (box) {
         let { x, y, width, height } = box.getBoundingClientRect()
         this.collisionBox = Range2D.fromXY(
            new Range1D([floor(x), floor(x + width)]),
            new Range1D([floor(y), floor(y + height)])
         )
      } else {
         this.collisionBox = this.svgBox // a sensible alternative
      }

      // Locate the ports of the symbol.
      this.ports = []
      for (let element of this.svgTemplate.querySelectorAll(
         "[id]:not(defs [id])"
      )) {
         if (element.id.toLowerCase().includes("snap")) {
            // Record this port.
            let { x, y, width, height } = element.getBoundingClientRect()
            this.ports.push(
               new PortKind(
                  element.id,
                  floor(x + width / 2),
                  floor(y + height / 2)
               )
            )
            // Remove it from the DOM - it shouldn't be rendered.
            element.remove()
         }
      }

      // The most complicated part: construct a second SVG element to act as
      // a "highlight" around the original element.
      this.highlightTemplate = this.svgTemplate.cloneNode(true) as SVGElement
      this.highlightTemplate.id = `${fileName}-highlight`
      this.highlightTemplate.setAttribute("overflow", "visible") // don't clip
      this.highlightTemplate.classList.add("svgTemplate")
      document
         .getElementById("symbol templates")
         ?.appendChild(this.highlightTemplate)
      // Find all the strokeable elements, and turn them into a highlight by
      // assigning them a thick stroke whose color is the highlight color.
      for (let e of this.highlightTemplate.querySelectorAll(
         "circle, ellipse, line, path, polygon, polyline, rect, text, textPath"
      )) {
         // We need to robustly check whether element "e" is actually visible.
         // If it isn't visible, we shouldn't highlight it.
         function hasOpacity0(color: string): boolean {
            let rgba = color.split(",")
            if (rgba.length === 4) {
               return parseFloat(rgba[3]) === 0
            } else if (color[0] === "#") {
               if (color.length === 5) return color[4] === "0"
               else return color.slice(7) === "00"
            } else {
               return color === "transparent"
            }
         }
         let style = window.getComputedStyle(e)
         let noStroke =
            style.stroke === "none" ||
            hasOpacity0(style.stroke) ||
            parseFloat(style.strokeOpacity) === 0 ||
            parseFloat(style.strokeWidth) === 0
         let noFill =
            style.fill === "none" ||
            hasOpacity0(style.fill) ||
            parseFloat(style.fillOpacity) === 0
         if (
            style.display === "none" ||
            e.getAttribute("visibility") === "hidden" || // only check own attr.
            parseFloat(style.opacity) === 0 ||
            (noStroke && noFill) ||
            e.classList.contains("noHighlight")
         ) {
            // The element is invisible, so it shouldn't be used as a highlight.
            e.remove()
         } else {
            let w = noFill ? strokeHighlightThickness : fillHighlightThickness
            // Turn the element into a highlight.
            e.setAttribute("fill", "none")
            e.setAttribute(
               "stroke-width",
               (parseFloat(style.strokeWidth) + w).toString()
            )
            // To stop highlights from "poking out" too far, use a round join.
            e.setAttribute("stroke-linejoin", "round")
            // Inherit the stroke color from an ancestor's "color" prop.
            e.setAttribute("stroke", "currentColor")
         }
      }
      // Namespace IDs to avoid conflicts.
      namespaceIDs(this.svgTemplate, this.kindID)
      namespaceIDs(this.highlightTemplate, this.kindID + "h")
   }
}

export class SymbolInstance extends Rectangle implements Deletable {
   static s: SymbolInstance[] = [] // order corresponds to rendering order
   readonly objectID: number // for serialization
   tags = new Set<Tag>()
   properties = new Set<PropertyString>()
   private static nextInstanceID = 0
   readonly instanceID: string
   readonly kind: SymbolKind
   readonly image: SVGElement
   readonly highlight: SVGElement
   readonly ports: Port[]
   specialAttachPoints: SpecialAttachPoint[]
   attachments = new Set<Junction>() // should only be modified from Junction class

   constructor(
      kind: SymbolKind,
      position: Point,
      rotation = Rotation.zero,
      scale = new Vector(1, 1),
      addToCircuit = true
   ) {
      super(kind.collisionBox, position, rotation, scale)
      this.objectID = nextObjectID++
      this.instanceID = ":" + SymbolInstance.nextInstanceID++
      this.kind = kind
      this.ports = kind.ports.map(
         (p) => new Port(this, p, this.fromRectCoordinates(p), addToCircuit)
      )
      this.specialAttachPoints = this.specialPoints().map(
         (p) => new SpecialAttachPoint(p.x, p.y, this)
      )
      if (addToCircuit) SymbolInstance.s.push(this)

      // Create the SVG for this Symbol.
      let svg = kind.svgTemplate.cloneNode(true) as SVGElement
      namespaceIDs(svg, this.instanceID)
      this.image = document.createElementNS("http://www.w3.org/2000/svg", "g")
      this.image.appendChild(svg)
      if (addToCircuit)
         document.getElementById("symbol layer")?.appendChild(this.image)
      // Create the SVG for this Symbol's highlight.
      let highlightSvg = kind.highlightTemplate.cloneNode(true) as SVGElement
      namespaceIDs(highlightSvg, this.instanceID)
      this.highlight = document.createElementNS(
         "http://www.w3.org/2000/svg",
         "g"
      )
      this.highlight.appendChild(highlightSvg)
      this.moveTo(position) // Initialize the symbol's DOM elements.
   }
   refresh() {
      // Add the SVG back to the DOM after a hot reload. (only needed for dev.)
      document.getElementById("symbol layer")?.appendChild(this.image)
      document
         .getElementById("symbol amassLight layer")
         ?.appendChild(this.highlight)
   }
   applySendToBack() {
      document.getElementById("symbol layer")?.prepend(this.image)
   }
   applyBringToFront() {
      document.getElementById("symbol layer")?.append(this.image)
   }
   delete(): Set<Junction> {
      let index = SymbolInstance.s.indexOf(this)
      if (index === -1) {
         // This Symbol is not in the circuit; it is on the clipboard.
         // No cleaning up is necessary.
         return new Set()
      }
      SymbolInstance.s.splice(index, 1)
      this.image.remove()
      this.highlight.remove()
      for (let port of this.ports) {
         Port.s.delete(port)
         if (port.edges().size > 0) {
            // Convert the Port to a Junction, and replace the Port's edges.
            let junction = port.cloneAsJunction()
            for (let [oldSegment, v] of port.edges()) {
               oldSegment.sliceOut(junction, v)
               oldSegment.delete()
            }
            port.edges().clear()
            // Try fusing the edges together.
            if (junction.edges().size === 2) junction.fuse()
         }
      }
      this.attachments.forEach((a) => a.detach())
      amassed.items.delete(this)
      return new Set()
   }
   edges(): Set<Edge> {
      return new Set(this.ports.flatMap((p) => [...p.edges()]))
   }
   axes(): Axis[] {
      let a: Axis[] = []
      for (let [{ axis }] of this.edges()) if (!a.includes(axis)) a.push(axis)
      return a
   }
   moveTo(point: Point) {
      ;(this.position as Point) = point
      let transform = `translate(${point.x} ${
         point.y
      }) rotate(${this.rotation.toDegrees()}) scale(${this.scale.x}, ${
         this.scale.y
      })`
      this.image.setAttribute("transform", transform)
      this.highlight.setAttribute("transform", transform)
      for (let [i, port] of this.ports.entries()) {
         let p = this.fromRectCoordinates(this.kind.ports[i])
         ;(port.x as number) = p.x
         ;(port.y as number) = p.y
      }
      this.specialAttachPoints = this.specialPoints().map(
         (p) => new SpecialAttachPoint(p.x, p.y, this)
      )
   }
   moveBy(displacement: Vector) {
      this.moveTo(this.position.displacedBy(displacement))
   }
   rotateAround(point: Point, rotation: Rotation) {
      ;(this.rotation as Rotation) = this.rotation.add(rotation)
      this.moveTo(this.position.rotatedAround(point, rotation))
   }
   flip() {
      let offset = new Vector(this.kind.svgBox.width() * this.scale.x, 0)
      ;(this.scale as Vector) = new Vector(-this.scale.x, this.scale.y)
      this.moveBy(offset.rotatedBy(this.rotation))
   }
   svgCorners(): Point[] {
      let { x, y } = this.kind.svgBox
      return [
         new Point(x.low, y.low),
         new Point(x.high, y.low),
         new Point(x.high, y.high),
         new Point(x.low, y.high),
      ].map((p) => this.fromRectCoordinates(p))
   }
   clone(addToCircuit = true): SymbolInstance {
      let symbol = new SymbolInstance(
         this.kind,
         this.position,
         this.rotation,
         this.scale,
         addToCircuit
      )
      symbol.tags = new Set(this.tags)
      symbol.properties = new Set(this.properties)
      return symbol
   }
}

function namespaceIDs(svg: SVGElement, suffix: string) {
   // To prevent the IDs of different instances of a Symbol SVG,
   // namespace the IDs.
   for (let element of svg.querySelectorAll("[id]")) {
      element.setAttribute("id", element.id + suffix)
   }
   for (let element of svg.querySelectorAll("use")) {
      const xlink = "http://www.w3.org/1999/xlink"
      let ref = element.getAttribute("href")
      let xRef = element.getAttributeNS(xlink, "href")
      if (ref && ref[0] === "#") element.setAttribute("href", ref + suffix)
      else if (xRef && xRef[0] === "#")
         element.setAttributeNS(xlink, "href", xRef + suffix)
   }
}

export class TextBox extends Rectangle implements Deletable {
   static es = new Set<TextBox>()
   readonly objectID: number // for serialization
   tags = new Set<Tag>()
   properties = new Set<PropertyString>()
   readonly fontSize = 24
   readonly text = ""
   specialAttachPoints: SpecialAttachPoint[]
   attachments = new Set<Junction>() // should only be modified from Junction class

   private static readonly font = "Source Sans"
   private static readonly minWidth = 20
   private static readonly emptyRange = Range2D.fromXY(
      new Range1D([0, 0]),
      new Range1D([0, 0])
   )
   private static canvas:HTMLCanvasElement // for size testing

   constructor(position: Point, rotation = Rotation.zero, addToCircuit = true) {
      super(TextBox.emptyRange, position, rotation, new Vector(1, 1))
      this.objectID = nextObjectID++
      this.setText("text")
      this.specialAttachPoints = this.specialPoints().map(
         (p) => new SpecialAttachPoint(p.x, p.y, this)
      )
      if (addToCircuit) TextBox.es.add(this)
   }
   setFontSize(fontSize: number) {
      ;(this.fontSize as number) = fontSize
      this.updateBoundingBox()
   }
   setText(text: string) {
      ;(this.text as string) = text
      this.updateBoundingBox()
   }
   private updateBoundingBox() {
      TextBox.canvas ||= document.createElement("canvas")
      // Use a Canvas to measure the size of the text.
      const context = TextBox.canvas.getContext(
         "2d"
      ) as CanvasRenderingContext2D
      context.font = `${this.fontSize}px ${TextBox.font}`
      const metrics = context.measureText(this.text)
      // Update the bounding box.
      ;(this.range as Range2D) = Range2D.fromXY(
         new Range1D([0, Math.max(metrics.width, TextBox.minWidth)]),
         new Range1D([
            -metrics.fontBoundingBoxAscent,
            metrics.fontBoundingBoxDescent,
         ])
      )
      // Update the positions of the special attachment points.
      this.specialAttachPoints = this.specialPoints().map(
         (p) => new SpecialAttachPoint(p.x, p.y, this)
      )
   }
   edges(): Set<Edge> {
      return new Set()
   }
   axes(): Axis[] {
      return []
   }
   delete(): Set<Junction> {
      TextBox.es.delete(this)
      this.attachments.forEach((a) => a.detach())
      amassed.items.delete(this)
      return new Set()
   }
   moveTo(point: Point) {
      ;(this.position as Point) = point
      this.specialAttachPoints = this.specialPoints().map(
         (p) => new SpecialAttachPoint(p.x, p.y, this)
      )
   }
   moveBy(displacement: Vector) {
      this.moveTo(this.position.displacedBy(displacement))
   }
   rotateAround(point: Point, rotation: Rotation) {
      ;(this.rotation as Rotation) = this.rotation.add(rotation)
      this.moveTo(this.position.rotatedAround(point, rotation))
   }
   clone(addToCircuit = true): TextBox {
      let textBox = new TextBox(this.position, this.rotation, addToCircuit)
      textBox.tags = new Set(this.tags)
      textBox.properties = new Set(this.properties)
      textBox.setFontSize(this.fontSize)
      textBox.setText(this.text)
      return textBox
   }
}

// Amassed items.
export type Interactable =
   | Junction
   | Port
   | Crossing
   | Segment
   | SymbolInstance
   | TextBox
export const amassed = { items: new Set<Interactable>() }

// Cut/copy/paste functionality.
export type Copyable = Segment | SymbolInstance | TextBox
export function isCopyable(thing: any): thing is Copyable {
   return (
      thing instanceof Segment ||
      thing instanceof SymbolInstance ||
      thing instanceof TextBox
   )
}
type CopiedItems = {
   items: Set<Copyable>
   segments: Map<Segment, Segment>
   symbols: Map<SymbolInstance, SymbolInstance>
   textBoxes: Map<TextBox, TextBox>
   junctions: Map<Junction, Junction>
   ports: Map<Port, Vertex> // Ports may be converted to junctions when copied.
}
let clipboard = new Set<Copyable>()
export function cut(items: Iterable<Copyable>) {
   clipboard = copy_(items, true).items
   for (let item of items) item.delete()
}
export function copy(items: Iterable<Copyable>) {
   clipboard = copy_(items, true).items
}
export function duplicate(items: Iterable<Copyable>): CopiedItems {
   return copy_(items, false)
}
export function paste(): Iterable<Copyable> {
   return copy_(clipboard, false).items
}
// Copy circuit items — either to the clipboard, or into the circuit.
export function copy_(
   items: Iterable<Copyable>,
   toClipboard: boolean
): CopiedItems {
   if (toClipboard && clipboard.size > 0) {
      // Delete the existing clipboard items.
      for (let item of clipboard) item.delete()
      clipboard = new Set()
   }
   let symbols = new Set<SymbolInstance>()
   let textBoxes = new Set<TextBox>()
   let segments = new Set<Segment>()
   for (let item of items) if (item instanceof SymbolInstance) symbols.add(item)
   for (let item of items) if (item instanceof TextBox) textBoxes.add(item)
   for (let item of items) if (item instanceof Segment) segments.add(item)
   let copiedSymbols = new Map<SymbolInstance, SymbolInstance>()
   let copiedPorts = new Map<Port, Vertex>()
   let copiedTextBoxes = new Map<TextBox, TextBox>()
   let copiedSegments = new Map<Segment, Segment>()
   let copiedJunctions = new Map<Junction, Junction>()
   for (let symbol of symbols) {
      let copiedSymbol = symbol.clone(!toClipboard)
      copiedSymbols.set(symbol, copiedSymbol)
      for (let i = 0; i < symbol.ports.length; ++i) {
         copiedSymbol.ports[i].copyFrom(symbol.ports[i])
         copiedPorts.set(symbol.ports[i], copiedSymbol.ports[i])
      }
   }
   for (let textBox of textBoxes) {
      copiedTextBoxes.set(textBox, textBox.clone(!toClipboard))
   }
   for (let segment of segments) {
      let copiedSegment = segment.clone(
         getCopied(segment.start),
         getCopied(segment.end),
         !toClipboard
      )
      copiedSegments.set(segment, copiedSegment)
   }
   // Initialize the crossingKinds between each pair of copied segments.
   // (If toClipboard = true, the copied segments are not part of the Segment.s
   // set, so Segment.clone() will not have initialized their crossingKinds.)
   for (let [seg1, copiedSeg1] of copiedSegments) {
      for (let [seg2, copiedSeg2] of copiedSegments) {
         let c = seg1.crossingKinds.get(seg2)
         if (c) copiedSeg1.crossingKinds.set(copiedSeg2, c)
      }
   }
   // For copied Junctions whose host (if any) was also copied, ensure that
   // their relationship is preserved.
   for (let [junction, copiedJunction] of copiedJunctions) {
      let host = junction.host()
      if (host instanceof Segment) {
         let copiedSegment = copiedSegments.get(host)
         if (copiedSegment) copiedJunction.attachTo(copiedSegment)
      } else if (host instanceof SymbolInstance) {
         let copiedSymbol = copiedSymbols.get(host)
         if (copiedSymbol) copiedJunction.attachTo(copiedSymbol)
      } else if (host) {
         let copiedTextBox = copiedTextBoxes.get(host)
         if (copiedTextBox) copiedJunction.attachTo(copiedTextBox)
      }
   }
   function getCopied(vertex: Vertex): Vertex {
      let copiedVertex =
         copiedJunctions.get(vertex as Junction) ||
         copiedPorts.get(vertex as Port)
      if (!copiedVertex) {
         if (vertex instanceof Junction) {
            // Junctions are being copied lazily. We haven't found a
            // pre-existing copy of the Junction, so we will copy it now.
            copiedVertex = vertex.clone(!toClipboard)
            copiedJunctions.set(vertex, copiedVertex)
         } else {
            // Symbols have already been copied at the time of this call, and
            // so have their Ports. Thus, the fact that we couldn't find a copy
            // of the Port means that its Symbol is not part of the selection.
            // We will replace it with a Junction.
            copiedVertex = vertex.cloneAsJunction(!toClipboard)
            copiedPorts.set(vertex, copiedVertex)
         }
      }
      return copiedVertex
   }
   return {
      items: new Set([
         ...copiedSegments.values(),
         ...copiedSymbols.values(),
         ...copiedTextBoxes.values(),
      ]),
      segments: copiedSegments,
      symbols: copiedSymbols,
      textBoxes: copiedTextBoxes,
      junctions: copiedJunctions,
      ports: copiedPorts,
   }
}

type ObjectID = number

type JunctionJSON = {
   objectID: ObjectID
   tags: Tag[]
   properties: PropertyString[]
   glyph: VertexGlyphKind
   glyphOrientation: GlyphOrientation
   position: { x: number; y: number }
}

type PortJSON = {
   objectID: ObjectID
   tags: Tag[]
   properties: PropertyString[]
   svgID: string // represents a PortKind
   glyph: VertexGlyphKind
   glyphOrientation: GlyphOrientation
}

type SegmentJSON = {
   objectID: ObjectID
   type: string // must be a LineType.name
   tags: Tag[]
   properties: PropertyString[]
   color: string
   isFrozen: boolean
   crossingKinds: { segmentID: ObjectID; crossing: CrossingGlyphKind }[]
   attachments?: ObjectID[]
   startID: ObjectID
   endID: ObjectID
   axis: { x: number; y: number }
}

type SymbolJSON = {
   objectID: ObjectID
   tags: Tag[]
   properties: PropertyString[]
   fileName: string // represents a SymbolKind
   ports: PortJSON[]
   attachments?: ObjectID[]
   // Rectangle data
   position: { x: number; y: number }
   rotation: { x: number; y: number }
   scale: { x: number; y: number }
}

type TextBoxJSON = {
   objectID: ObjectID
   tags: Tag[]
   properties: PropertyString[]
   fontSize: number
   text: string
   attachments?: ObjectID[]
   // Rectangle data
   position: { x: number; y: number }
   rotation: { x: number; y: number }
}

type AmassedJSON =
   | { type: "crossing"; seg1ID: ObjectID; seg2ID: ObjectID }
   | { type: "other"; objectID: ObjectID }

export type CircuitJSON = {
   junctions: JunctionJSON[]
   segments: SegmentJSON[]
   symbols: SymbolJSON[]
   textBoxes: TextBoxJSON[]
   amassedItems: AmassedJSON[]
}

export const emptyCircuitJSON: CircuitJSON = {
   junctions: [],
   segments: [],
   symbols: [],
   textBoxes: [],
   amassedItems: [],
}

// Save the current circuit state to a JSON object.
export function saveToJSON(): CircuitJSON {
   let junctions = [...Junction.s].map((j) => {
      return {
         objectID: j.objectID,
         tags: [...j.tags],
         properties: [...j.properties],
         glyph: j.glyph,
         glyphOrientation: j.glyphOrientation,
         position: { x: j.x, y: j.y },
      }
   })
   let segments = [...Segment.s].map((s) => {
      let crossingKinds = []
      for (let other of Segment.s) {
         let crossing = s.crossingKinds.read(other)
         if (crossing.type !== "auto") {
            crossingKinds.push({ segmentID: other.objectID, crossing })
         }
      }
      return {
         objectID: s.objectID,
         type: s.type.name,
         tags: [...s.tags],
         properties: [...s.properties],
         color: s.color,
         isFrozen: s.isFrozen,
         crossingKinds,
         attachments: [...s.attachments].map((j) => j.objectID),
         startID: s.start.objectID,
         endID: s.end.objectID,
         axis: { x: s.axis.x, y: s.axis.y },
      }
   })
   let symbols = [...SymbolInstance.s].map((s) => {
      return {
         objectID: s.objectID,
         tags: [...s.tags],
         properties: [...s.properties],
         fileName: s.kind.fileName,
         ports: s.ports.map((p) => {
            return {
               objectID: p.objectID,
               tags: [...p.tags],
               properties: [...p.properties],
               svgID: p.kind.svgID,
               glyph: p.glyph,
               glyphOrientation: p.glyphOrientation,
            }
         }),
         attachments: [...s.attachments].map((j) => j.objectID),
         position: { x: s.position.x, y: s.position.y },
         rotation: { x: s.rotation.x, y: s.rotation.y },
         scale: { x: s.scale.x, y: s.scale.y },
      }
   })
   let textBoxes = [...TextBox.es].map((t) => {
      return {
         objectID: t.objectID,
         tags: [...t.tags],
         properties: [...t.properties],
         fontSize: t.fontSize,
         text: t.text,
         attachments: [...t.attachments].map((j) => j.objectID),
         position: { x: t.position.x, y: t.position.y },
         rotation: { x: t.rotation.x, y: t.rotation.y },
      }
   })
   let amassedItems: AmassedJSON[] = [...amassed.items].map((i) =>
      i instanceof Crossing
         ? {
              type: "crossing",
              seg1ID: i.seg1.objectID,
              seg2ID: i.seg2.objectID,
           }
         : { type: "other", objectID: i.objectID }
   )
   return { junctions, segments, symbols, textBoxes, amassedItems }
}

// Load the circuit state from a JSON object.
export function loadFromJSON(
   circuit: CircuitJSON,
   symbolKinds: Map<string, SymbolKind>,
   lineTypes: Map<string, LineType>,
   crossingMap: DefaultMap<Segment, Map<Segment, Crossing>>
) {
   ;[...Segment.s].forEach((s) => s.delete()) // to decrement Axis counters
   ;[...SymbolInstance.s].forEach((s) => s.delete()) // to remove DOM elements
   Junction.s = new Set()
   Port.s = new Set()
   Segment.s = new Set()
   SymbolInstance.s = []
   TextBox.es = new Set()
   amassed.items = new Set()
   let vertexMap = new Map<ObjectID, Vertex>()
   let segmentMap = new Map<ObjectID, Segment>()
   let symbolMap = new Map<ObjectID, SymbolInstance>()
   let textBoxMap = new Map<ObjectID, TextBox>()
   circuit.junctions.forEach((j) => {
      // This initialization should mimic Junction.clone().
      let junction = new Junction(new Point(j.position.x, j.position.y))
      junction.tags = new Set(j.tags)
      junction.properties = new Set(j.properties)
      junction.glyph = j.glyph
      junction.glyphOrientation = j.glyphOrientation
      vertexMap.set(j.objectID, junction)
   })
   circuit.symbols.forEach((s) => {
      let kind = symbolKinds.get(s.fileName)
      if (kind) {
         // This initialization should mimic SymbolInstance.clone().
         let symbol = new SymbolInstance(
            kind,
            new Point(s.position.x, s.position.y),
            new Rotation(s.rotation.x, s.rotation.y),
            new Vector(s.scale.x, s.scale.y)
         )
         symbol.tags = new Set(s.tags)
         symbol.properties = new Set(s.properties)
         symbolMap.set(s.objectID, symbol)
         // Load the state of the symbol's ports.
         let portsByID = new Map(symbol.ports.map((p) => [p.kind.svgID, p]))
         s.ports.forEach((p) => {
            let port = portsByID.get(p.svgID)
            if (port) {
               // This initialization should mimic Port.copyFrom().
               port.tags = new Set(p.tags)
               port.properties = new Set(p.properties)
               port.glyph = p.glyph
               port.glyphOrientation = p.glyphOrientation
               vertexMap.set(p.objectID, port)
            }
         })
         // Load the symbol's attachments.
         for (let id of s.attachments || []) {
            let j = vertexMap.get(id)
            if (!j) {
               console.error(
                  `Failed to find a junction (ID ${id}) attached to a symbol (ID ${s.objectID}).`
               )
            } else {
               ;(j as Junction).attachTo(symbol)
            }
         }
      } else {
         console.error(
            `Failed to load a symbol, because the SymbolKind "${s.fileName}" could not be found.`
         )
      }
   })
   circuit.textBoxes.forEach((t) => {
      // This initialization should mimic TextBox.clone().
      let textBox = new TextBox(
         new Point(t.position.x, t.position.y),
         new Rotation(t.rotation.x, t.rotation.y)
      )
      textBox.tags = new Set(t.tags)
      textBox.properties = new Set(t.properties)
      textBox.setFontSize(t.fontSize)
      textBox.setText(t.text)
      textBoxMap.set(t.objectID, textBox)
      // Load the text box's attachments.
      for (let id of t.attachments || []) {
         let j = vertexMap.get(id)
         if (!j) {
            console.error(
               `Failed to find a junction (ID ${id}) attached to a text box (ID ${t.objectID}).`
            )
         } else {
            ;(j as Junction).attachTo(textBox)
         }
      }
   })
   // Pass 1: Construct the Segment objects.
   circuit.segments.forEach((s) => {
      let lineType = lineTypes.get(s.type)
      let start = vertexMap.get(s.startID)
      let end = vertexMap.get(s.endID)
      if (!lineType) {
         console.error(
            `Failed to load a segment (ID ${s.objectID}), because the LineType "${s.type}" could not be found.`
         )
      }
      if (!start) {
         console.error(
            `Failed to load a segment (ID ${s.objectID}), because failed to locate its vertex (ID ${s.startID}).`
         )
      }
      if (!end) {
         console.error(
            `Failed to load a segment (ID ${s.objectID}), because failed to locate its vertex (ID ${s.endID}).`
         )
      }
      if (lineType && start && end) {
         // This initialization should mimic Segment.clone().
         let segment = new Segment(
            lineType,
            start,
            end,
            Axis.fromVector(new Vector(s.axis.x, s.axis.y)) as Axis
         )
         segment.tags = new Set(s.tags)
         segment.properties = new Set(s.properties)
         segment.color = s.color
         segment.isFrozen = s.isFrozen
         for (let id of s.attachments || []) {
            let j = vertexMap.get(id)
            if (!j) {
               console.error(
                  `Failed to find a junction (ID ${id}) attached to a segment (ID ${s.objectID}).`
               )
            } else {
               ;(j as Junction).attachTo(segment)
            }
         }
         segmentMap.set(s.objectID, segment)
      }
   })
   // Pass 2: Set the crossing type of each segment pair.
   circuit.segments.forEach((s) => {
      let s1 = segmentMap.get(s.objectID)
      if (!s1) return // Segment may have failed to load.
      for (let crossing of s.crossingKinds) {
         let s2 = segmentMap.get(crossing.segmentID)
         if (!s2) continue // Segment may have failed to load.
         s1.crossingKinds.set(s2, crossing.crossing)
      }
   })
   amassed.items = new Set<Interactable>()
   for (let item of circuit.amassedItems) {
      if (item.type === "crossing") {
         let seg1 = segmentMap.get(item.seg1ID)
         let seg2 = segmentMap.get(item.seg2ID)
         let crossPoint = seg1 && seg2 ? seg1.intersection(seg2) : undefined
         if (seg1 && seg2 && crossPoint) {
            let crossing = new Crossing(seg1, seg2, crossPoint)
            crossingMap.getOrCreate(seg1).set(seg2, crossing)
            amassed.items.add(crossing)
         } else {
            console.error(
               `Failed to assign the crossing of two segments (ID ${item.seg1ID} and ID ${item.seg2ID}) to the set of amassed items because at least one of these segments does not exist.`
            )
         }
      } else {
         let object =
            vertexMap.get(item.objectID) ||
            segmentMap.get(item.objectID) ||
            symbolMap.get(item.objectID) ||
            textBoxMap.get(item.objectID)
         if (object) {
            amassed.items.add(object)
         } else {
            console.error(
               `Failed to assign an object (ID ${item.objectID}) to the set of amassed items because no object with that ID exists.`
            )
         }
      }
   }
}
