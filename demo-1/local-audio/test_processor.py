import unittest
from processor import assign_words, suggest_people


class AlignmentTests(unittest.TestCase):
    def test_returning_speaker_stays_consistent(self):
        turns = [dict(start=0, end=1, speaker='speaker_1'), dict(start=1, end=2, speaker='speaker_2'), dict(start=2, end=3, speaker='speaker_1')]
        words = [dict(start=i+.1, end=i+.9, text=' hello') for i in range(3)]
        self.assertEqual([s['speaker'] for s in assign_words(words, turns)], ['speaker_1', 'speaker_2', 'speaker_1'])

    def test_unmatched_and_overlap_are_flagged(self):
        words = [dict(start=1, end=2, text=' hello')]
        self.assertEqual(assign_words(words, [])[0]['speaker'], 'unknown')
        turns = [dict(start=1, end=2, speaker='speaker_1'), dict(start=1, end=2, speaker='speaker_2')]
        self.assertTrue(assign_words(words, turns)[0]['uncertain'])

    def test_only_explicit_introductions_suggest_names(self):
        people = suggest_people([dict(speaker='speaker_1', text="My name is Maya and I'm the general contractor."), dict(speaker='speaker_2', text='Maya will send the plan.')])
        self.assertEqual(people[0]['name'], 'Maya')
        self.assertEqual(people[0]['role'], 'general contractor')
        self.assertEqual(people[1]['name'], '')

class VocabularyTests(unittest.TestCase):
    def test_terms_are_hints_not_automatic_name_or_transcript_replacements(self):
        from processor import transcription_prompt
        prompt = transcription_prompt('Rae Chen, Eastvale Construction')
        self.assertIn('repour', prompt)
        self.assertIn('Rae Chen, Eastvale Construction', prompt)
        self.assertNotIn('Rae Chen', transcription_prompt())

    def test_invalid_hint_payloads_are_rejected(self):
        from processor import transcription_prompt
        for value in ['x' * 601, 'name\nsecond line', None]:
            with self.assertRaises(ValueError):
                transcription_prompt(value)


if __name__ == '__main__':
    unittest.main()
