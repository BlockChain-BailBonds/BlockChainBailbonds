import unittest

from backend.attention import block_receipt, choose_question, make_slots, public_question


class AttentionContributionTests(unittest.TestCase):
    def test_block_has_exactly_five_opaque_slots_and_no_participant_reward(self):
        slots = make_slots()
        receipt = block_receipt("block_1", "campaign_1", "awaiting_provider", slots)
        self.assertEqual(5, len(slots))
        self.assertEqual(5, len(set(slots)))
        self.assertIn("No participant reward", receipt["funding_notice"])

    def test_question_never_exposes_its_answer(self):
        question = choose_question([{"prompt": "Which sponsor message was shown?", "options": ["A", "B"], "answer_index": 1}])
        self.assertEqual(1, question["answer_index"])
        self.assertNotIn("answer_index", public_question(question))

    def test_invalid_question_bank_is_rejected(self):
        with self.assertRaises(ValueError):
            choose_question([{"prompt": "Broken", "options": ["A"], "answer_index": 4}])


if __name__ == "__main__":
    unittest.main()
