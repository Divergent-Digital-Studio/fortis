import { describe, it, expect } from 'vitest';
import { domainGroup } from './domain-group';

describe('domainGroup', () => {
    it('collapses a subdomain to its registrable domain', () => {
        expect(domainGroup('api.github.com')).toBe('github.com');
        expect(domainGroup('a.b.c.example.org')).toBe('example.org');
    });

    it('keeps a bare registrable domain intact', () => {
        expect(domainGroup('example.com')).toBe('example.com');
    });

    it('handles multi-part public suffixes', () => {
        expect(domainGroup('www.bbc.co.uk')).toBe('bbc.co.uk');
        expect(domainGroup('shop.example.com.au')).toBe('example.com.au');
    });

    it('collapses per-instance cloud hostnames to their service', () => {
        expect(domainGroup('ec2-13-59-1-2.compute.amazonaws.com')).toBe('compute.amazonaws.com');
        expect(domainGroup('d1abc.cloudfront.net')).toBe('cloudfront.net');
        expect(domainGroup('4.3.2.1.in-addr.arpa')).toBe('in-addr.arpa');
    });

    it('leaves IP literals and single labels alone', () => {
        expect(domainGroup('192.168.1.1')).toBe('192.168.1.1');
        expect(domainGroup('fe80::1')).toBe('fe80::1');
        expect(domainGroup('localhost')).toBe('localhost');
    });

    it('normalizes case and a trailing root dot', () => {
        expect(domainGroup('API.GitHub.com.')).toBe('github.com');
    });
});
