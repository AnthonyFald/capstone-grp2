"""Live estimates from observed progress; no transcript or audio is stored here."""
import math
import time


class AudioProgress:
    # Rough cold-start CPU estimates only, replaced by observations as work advances.
    DEFAULT_RATES = {'grouping': .15, 'base.en': .30, 'small.en': .75}

    def __init__(self, model='base.en', rates=None, clock=time.monotonic):
        self.clock = clock
        self.started = self.phase_started = clock()
        self.model = model
        self.rates = dict(self.DEFAULT_RATES, **(rates or {}))
        self.learned = {}
        self.duration = None
        self.stage = 'reading'
        self.step = None
        self.fraction = None
        self.deadline = None
        self.scope = 'processing'
        self.message = 'Reading audio…'

    def update(self, message, stage=None, fraction=None, duration=None, step=None):
        now = self.clock()
        if duration is not None:
            self.duration = float(duration)
        # Inference libraries can return NumPy scalars; keep status JSON-native.
        if fraction is not None:
            fraction = float(fraction)
            fraction = min(1.0, max(0.0, fraction)) if math.isfinite(fraction) else None
        stage = stage or self.stage
        if (stage, step) != (self.stage, self.step):
            if self.stage in ('grouping', 'transcription') and self.duration and self.fraction is not None and self.fraction >= .9:
                key = 'grouping' if self.stage == 'grouping' else self.model
                self.learned[key] = max(.001, (now - self.phase_started) / self.duration)
            self.phase_started = now
        self.stage, self.step, self.fraction = stage, step, fraction
        self.message = message
        self.scope = 'download' if stage == 'download' else 'processing'
        self.deadline = None
        elapsed = now - self.phase_started
        if stage in ('grouping', 'transcription') and self.duration:
            key = 'grouping' if stage == 'grouping' else self.model
            total = self.duration * self.rates[key] + 2
            if fraction is not None and fraction >= .02 and elapsed >= .25:
                total = elapsed / min(1, fraction)
            remaining = max(0, total - elapsed)
            if stage == 'grouping':
                remaining += self.duration * self.rates[self.model] + 2
            self.deadline = now + remaining + 2  # final alignment/review preparation
        elif stage == 'download' and fraction is not None and 0 < fraction < 1 and elapsed >= .25:
            self.deadline = now + elapsed * (1 - fraction) / fraction
        elif stage == 'finishing':
            self.deadline = now + 2

    def snapshot(self):
        now = self.clock()
        remaining = self.deadline - now if self.deadline is not None else None
        return dict(stage=self.stage, message=self.message,
                    percent=None if self.fraction is None else min(100, max(0, round(100 * self.fraction))),
                    elapsedSeconds=round(now - self.started, 1),
                    etaSeconds=math.ceil(remaining) if remaining is not None and remaining > 0 else None,
                    etaScope=self.scope,
                    overdue=bool(remaining is not None and remaining <= 0))
