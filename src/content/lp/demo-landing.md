---
title: 'Demo landing — every schema field in one entry'
subtitle: 'One markdown entry per campaign landing. This file exercises the whole schema: both bullet forms, FAQ, badges and the hero-form layout.'
metaTitle: 'Demo landing · Saastro Theme'
metaDescription: 'Schema example for the lp collection — draft, never public.'
eyebrow: 'Demo'
layout: 'hero-form'
form: 'contact'
formTitle: 'Request a callback'
formNote: 'No obligation — we reply within one business day.'
badge: 'No commitment'
priceNote: 'From €12/mo'
bullets:
  - 'A plain one-line fact — the string form of a bullet'
  - title: 'A structured bullet'
    description: 'The object form carries a bold title plus this supporting line.'
faq:
  - q: 'What is this entry?'
    a: 'The schema example + smoke fixture for the lp collection. It exercises both bullet forms, the FAQ list and the hero-form layout.'
  - q: 'Why is it draft: true?'
    a: 'Drafts never render — /lp/demo-landing redirects home. Flip draft locally to smoke-test, revert before committing.'
order: 0
draft: true
---

<!-- Schema example + smoke fixture for the `lp` collection. NEVER public:
`draft: true` keeps it out of /lp/demo-landing (the route redirects drafts
home). Keep it as the reference a client copies when writing a real landing. -->

The markdown body renders below the hero on the `hero-form` layout and as the
main read on `largo`. Write the landing's long-form pitch here.
