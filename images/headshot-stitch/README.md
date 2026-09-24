# PLACEHOLDER DATA

Everything in this folder is **placeholder data**. None of it is model output.

It was made by `trial/make_placeholder.py` from the reintegration job
`images/Jenkinson_github.zip` (job name `Jenkinson_github`, 12 painted layers):

- `base.png`: the job's photo with its long side scaled to 1024 px
  (812 x 1024). It is not padded to a square.
- 12 regions (4 french knot, 1 silk purl, 7 satin): one per painted layer (colour mask), each with
  its own stitch and colour, and nothing merged. A layer whose mask is in
  several separate pieces is still one region, so clicking any of its pieces
  re-stitches all of them. Regions are listed, and drawn, stage by stage: one
  stage per stitch, in the order french_knot, silk_purl, satin. `region` is the layer's position in
  the job and `layer` is its id. The masks do not overlap, so no layer loses pixels to a later one. Each patch's brim stops at
  every other layer, so neighbouring layers never spill into each other.

  | layer | stitch | pieces | area (px) |
  | --- | --- | ---: | ---: |
  | colour_2 | french knot | 21 | 105634 |
  | colour_4 | french knot | 36 | 87794 |
  | colour_6 | french knot | 7 | 66829 |
  | colour_12 | french knot | 19 | 40285 |
  | colour_7 | silk purl | 42 | 61899 |
  | colour_1 | satin | 1 | 110157 |
  | colour_3 | satin | 26 | 99201 |
  | colour_5 | satin | 4 | 68302 |
  | colour_8 | satin | 11 | 54535 |
  | colour_9 | satin | 8 | 53201 |
  | colour_10 | satin | 10 | 42326 |
  | colour_11 | satin | 5 | 41325 |
- 5 variants per region (`<stitch>_<layer id>_v<k>.webp`): procedural satin, French knots and
  silk purl, drawn in numpy from each layer's own colour, satin angle and
  thread width, knot radius and coil pitch, and shaded a little from the
  photo. Variant 0 uses the job's settings as given. The other variants change
  the satin angle, thread colour, knot size and spacing, and coil pitch.
- Patch edges use the job's `brim` (10 px) and `sib_feather` (3 px),
  as the pipeline does.
- `regions.js` and `regions.json` use the same format that
  `staged_reintegrate.py --job ... --region_variants K` writes, including
  `width`, `height` and each region's `layer`. bboxes are in `base.png` pixels.

To rebuild it, run this from the repo root:

    python trial/make_placeholder.py "images/Jenkinson_github.zip" trial/headshot --variants 5 --quality 74

## Making the real version

`staged_reintegrate.py` (in `Reintegrating Losses/_public/pipeline/`) has no
flag for one region per layer. With `--per_region` it cuts each stitch's
combined mask into connected parts, so a real run of this job would give
75 regions, not 12: touching layers with the same stitch merge,
and a layer in several pieces becomes several regions. There are two ways to
get one region per colour mask with 5 variants each.

**1. A small change to the pipeline (recommended).** It all sits in the
`if args.per_region:` block of `main()`, roughly 40 lines:

- Cut each layer's own mask into pieces, instead of the stage's combined
  mask: loop over `stage_layers[st]` and run `cv2.connectedComponents` on
  that layer's mask (`lma[li]`). Keep filling each piece in its own padded
  crop, as now, so small pieces are still enlarged for the model (capped by
  the job's `region_max_up`). Each fill then uses its own layer's prompt and
  denoise (`pd[li]`), so the "layer covering most of it" choice goes away.
- Build each piece's composite mask with every other layer as the protected
  zone, not `others[st]` (the other stitches only). The brim and
  `sib_feather` then also stop at neighbouring layers of the same stitch.
- Make the fill seed depend on the layer as well as the piece (it is
  `seed + 1000 * lab + k` now), so pieces of two layers never share a seed.
- For each layer and variant k, paste the k-th fill of all its pieces onto
  one canvas. After the layer's last piece, save one
  `<stitch>_<layer id>_v<k>.png`, cropped to the bounding box of the whole
  layer's composite mask and with that mask as its alpha. Write one
  `regions.json` entry per layer (`region` = the layer's position in the job,
  `layer` = its id). Variant 0 still goes into the running image piece by
  piece, as now.
- Pieces under 25 px get no fill now, so they would be holes in a layer's
  patch. This job has none, but the change should either drop that limit or
  keep the paste-init there.

This job has 190 pieces of 25 px or more across its layers, so 5
variants means 950 fills, against 375 for the 75 regions
`--per_region` makes now (about 2.5 times the GPU time). Filling each
whole layer in one crop would need only 60 fills, but a layer spread over
the photo would get a full-size crop and lose the enlargement, so small
pieces would come out with coarser stitches.

With the change behind a new flag (called `--per_layer` here only as an
example), run from `Reintegrating Losses/_public`:

    python pipeline/staged_reintegrate.py --job <job.zip> --model flux_base --lora_variant trigonly_v2 --region_variants 5 --per_layer

The job already sets `per_region`, `brim`, `sib_feather` and
`region_max_up`. Its `region_variants` setting is 0, so the flag is
needed. `run_jobs.py <folder> -- --region_variants 5 --per_layer` does the
same for a folder of jobs.

**2. No pipeline change: merge afterwards.** Run the pipeline as it is, with
`--region_variants 5` (75 regions). Then merge its patches with a
short script, which does not exist yet: for each layer and variant k, paste
the k-th patch of every region that touches the layer onto one canvas, and
give it the layer's own composite mask as alpha (worked out from the job's
masks the way `make_placeholder.py` does). The catch is that a region
covering two touching layers was filled once, with the prompt and denoise of
the layer covering most of it. The smaller layer keeps its own colour from
its paste-init, but not its own prompt, and its variants change together
with its neighbour's.

## Swapping in a real run

1. Paint the masks in the mask tool on the project page and export the job
   zip (this folder came from `images/Jenkinson_github.zip`).
2. Run the job as described in "Making the real version" above. A run of the
   pipeline as it is now gives 75 regions, not one per layer.
3. Delete the placeholder files here. Then copy everything in the run's
   `variants/` folder into this folder: `base.png`, the `*_v*.png`
   patches, `regions.js` and `regions.json`. Use the run's `regions.js`,
   because its file names and bboxes match its own patches, not these ones.

The widget reads only `regions.js`, the base image and the patch files
named in `regions.js`. It accepts .png, .webp and .jpg files.

Notes:

- The widget looks for `base.png`, then `base.jpg`, then `base.webp`. To
  name one directly, add `data-base="base.jpg"` to the
  `<div class="embroider">`.
- Each painted layer is one region. To make two areas separate regions, paint
  them as two layers.
- Pipeline patches are PNGs, so a full run may be much larger than this
  folder (4.4 MB). Converting them to .webp and editing the names in
  `regions.js` to match is optional.
