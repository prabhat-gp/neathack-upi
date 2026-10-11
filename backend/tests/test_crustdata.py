import unittest
from unittest.mock import patch
import httpx
from integrations.crustdata import identify_companies

class CompanyResearchTests(unittest.IsolatedAsyncioTestCase):
    async def test_candidates_preserve_ambiguity_and_provenance(self):
        def reply(request):
            self.assertEqual(request.url.host, 'api.crustdata.com')
            self.assertEqual(request.headers['x-api-version'], '2025-11-01')
            return httpx.Response(200, json=[{'matched_on':'bank.example','matches':[
                {'confidence_score':1,'company_data':{'crustdata_company_id':1,'basic_info':{'name':'Bank'}}},
                {'confidence_score':1,'company_data':{'crustdata_company_id':2,'basic_info':{'name':'Bank Careers'}}}]}])
        with patch('config.CRUSTDATA_API_KEY','test-secret'):
            result = await identify_companies(['bank.example'],transport=httpx.MockTransport(reply))
        self.assertEqual(len(result['companies'][0]['candidates']),2)
        self.assertNotIn('test-secret',str(result))
        self.assertIn('not customer or merchant risk',result['purpose'])

    async def test_no_match_is_not_a_fraud_verdict(self):
        with patch('config.CRUSTDATA_API_KEY','test'):
            result=await identify_companies(['missing.example'],transport=httpx.MockTransport(lambda r:httpx.Response(200,json=[])))
        self.assertEqual(result['companies'][0]['status'],'no_match')
        self.assertIn('never be treated as fraud',' '.join(result['limitations']))

    async def test_provider_error_does_not_leak_body(self):
        with patch('config.CRUSTDATA_API_KEY','test'):
            with self.assertRaisesRegex(RuntimeError,'HTTP 429') as caught:
                await identify_companies(['bank.example'],transport=httpx.MockTransport(lambda r:httpx.Response(429,text='private-provider-body')))
        self.assertNotIn('private-provider-body',str(caught.exception))

    async def test_rejects_personal_identifiers_and_urls(self):
        for domains in [['person@bank'],['https://bank.example'],[],['127.0.0.1']]:
            with self.assertRaises(ValueError): await identify_companies(domains)

    async def test_missing_key_is_explicit(self):
        with patch('config.CRUSTDATA_API_KEY',''):
            with self.assertRaisesRegex(RuntimeError,'not configured'): await identify_companies(['bank.example'])
