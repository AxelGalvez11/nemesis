# The Stripe product image

`nemesis-stripe-product-512.png` is what customers see beside "Nemesis" in Stripe
Checkout and in the billing portal. Uploaded to live product `prod_V60O6tkvA8euaF`
on 2026-08-18.

**It is the three-bead mark, rendered from `landing/app/icon.svg`.** Not
`marketing/logo-4k-v1/`, which is the retired "M" wing and is no longer the mark.

**Light mode, deliberately.** `icon.svg` inverts the whole mark under
`prefers-color-scheme: dark`, and inverting a white specular turns it black, so the
dark rendering reads as three holes rather than three glossy beads. Stripe's
checkout and dashboard are light surfaces, so the light rendering is both correct
and the one that survives the context it is shown in.

512x512, near-white plate (#f6f6f6), the mark at its `icon.svg` geometry.
