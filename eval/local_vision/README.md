# Local Vision Eval Format

Each eval case should keep sampled frames and labels together:

```text
eval/local_vision/session_001/window_0001/
  frames/
    f001.jpg
    f002.jpg
  labels.json
```

For PulsePoint local vision, false `visible` claims are worse than uncertainty. Track:

- per-question visible / not_visible / uncertain accuracy
- false visible claims
- false not-visible claims
- uncertainty rate
- forbidden-claim success
- stage-candidate correctness
