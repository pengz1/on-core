// Copyright, 2016, EMC, Inc.
/* jshint node: true */

'use strict';
var nock = require('nock');
var ping = require('ping');

describe("HttpTool", function(){
    var httpTool, HttpTool;
    var siteGen = 'http://mysite.emc.com';
    var requestSettings = {};

    before(function(){
        helper.setupInjector(
            _.flattenDeep([
                helper.require('/lib/common/http-tool.js')
            ])
        );
        HttpTool = helper.injector.get('HttpTool');
        httpTool = new HttpTool();
    });

    it('Should handle basic auth', function(){
        nock(siteGen).get('/basicAuth')
        .basicAuth({user:'hello', pass:'world'})
        .reply(200);

        requestSettings.url = siteGen + '/basicAuth';
        requestSettings.method = 'GET';
        requestSettings.credential = {username:'hello', password:'world'};

        return httpTool.setupRequest(requestSettings)
        .then(function(){
            return httpTool.runRequest();
        })
        .then(function(data){
            expect(data).to.have.property('httpStatusCode').to.equal(200);
        });
    });

    it('can handle header change', function(){
        nock(siteGen)
        .matchHeader('cookie', 'mySession')
        .get('/withCookie')
        .reply(200);

        requestSettings.url = siteGen + '/withCookie';
        requestSettings.method = 'GET';
        requestSettings.headers = {cookie: 'mySession'};
        
        return httpTool.setupRequest(requestSettings)
        .then(function(){
            return httpTool.runRequest();
        })
        .then(function(data){
            expect(data).to.have.property('httpStatusCode').to.equal(200);
        });
    });

    it('can handle secure http and non-standard port', function(){
        nock('https://mysite.emc.com:12345')
        .get('/non-standard-port/http-secure')
        .reply(200, 'You are good');
        
        requestSettings.url = 'https://mysite.emc.com:12345/non-standard-port/http-secure';
        requestSettings.method = 'GET';
        
        return httpTool.setupRequest(requestSettings)
        .then(function(){
            return httpTool.runRequest();
        })
        .then(function(data){
            expect(data).to.have.property('body').to.equal('You are good');
        });
    });

    it('can handle object formatted url', function(){
        nock(siteGen).get('/getWithObjUrl').reply(200);

        requestSettings.url = {
            protocol: "http",
            host: "mysite.emc.com",
            path: "/getWithObjUrl"
        };
        requestSettings.method = 'GET';

        return httpTool.setupRequest(requestSettings)
        .then(function(){
            return httpTool.runRequest();
        })
        .then(function(data){
            expect(data).to.have.property('httpStatusCode').to.equal(200); 
        });
    });
    
    it('can put err into reject', function(done){
        nock(siteGen).get('/good-get').reply(200);

        requestSettings.url = siteGen + '/bad-get';
        requestSettings.method = 'GET';
        
        httpTool.setupRequest(requestSettings)
        .then(function(){
            return httpTool.runRequest();
        })        
        .then(function(){
            done(new Error('Should never reach here, otherwise have errors'));
        })
        .catch(function(err){
            expect(err).to.have.property('status').to.equal(404);
            done();
        });
    });

    it('can do DELETE', function(){
        nock(siteGen).delete('/delete-good').reply(200, 'Delete Successfully');

        requestSettings.url = siteGen + '/delete-good';
        requestSettings.method = 'DELETE';

        return httpTool.setupRequest(requestSettings)
        .then(function(){
            return httpTool.runRequest();
        })        
        .then(function(data){
            expect(data).to.have.property('body').to.equal('Delete Successfully');
        });
    });

    it('can do simple POST', function(){
        nock.cleanAll();
        requestSettings = {};
        
        nock(siteGen)
        .post('/simple-post').reply(201, 'OK');

        requestSettings.url = siteGen + '/simple-post';
        requestSettings.method = 'POST';
        requestSettings.data = '<data>My XML data</data>';

        return httpTool.setupRequest(requestSettings)
        .then(function(){
            return httpTool.runRequest();
        })
        .then(function(data){
            expect(data).to.have.property('body').to.equal('OK');
        });
    });

    it('can do PUT with multiple headers', function(){
        nock.cleanAll();
        requestSettings = {};

        nock(siteGen)
        .matchHeader('content-type', 'application/xml')
        .matchHeader('token', 'my-ssl-token')
        .put('/put/header').reply(204);

        requestSettings.url = siteGen + '/put/header';
        requestSettings.method = 'PUT';
        requestSettings.headers = {"content-type": "application/xml", "token": "my-ssl-token"};
        requestSettings.data = '<data>some data</data>';
        
        return httpTool.setupRequest(requestSettings)
        .then(function(){
            return httpTool.runRequest();
        })
        .then(function(data){
            expect(data).to.have.property('httpStatusCode').to.equal(204);
        });
    });

    it('can PATCH successfully', function(){
        nock.cleanAll();
        requestSettings = {};

        nock(siteGen).intercept('/simple/patch', 'PATCH').reply(304);

        requestSettings.url = siteGen + '/simple/patch';
        requestSettings.method = 'PATCH';

        return httpTool.setupRequest(requestSettings)
        .then(function(){
            return httpTool.runRequest();
        })
        .then(function(data){
            expect(data).to.have.property('httpStatusCode').to.equal(304);
        });
    });

    it('should ping given IP without arguments', function(){
        sinon.stub(ping.promise, 'probe').resolves({alive: true});
        return httpTool.ping('10.1.1.1')
        .then(function(res){
            expect(ping.promise.probe).to.be.calledWith(
                '10.1.1.1',
                {
                    timeout: 1
                }
            );
            expect(res.alive).to.be.equal(true);
        });
    });

    it('should ping given IP with argument', function(){
        ping.promise.probe.reset();
        return httpTool.ping('10.1.1.1', 2000, ['-i 2'])
        .then(function(){
            expect(ping.promise.probe).to.be.calledWith(
                '10.1.1.1',
                {
                    timeout: 2,
                    extra: ['-i 2']
                }
            );
        });
    });

    it('should report host is not alive error', function (done) {
        ping.promise.probe.restore();
        sinon.stub(ping.promise, 'probe').resolves({alive: false});
        var host = '172.1.1.1';
        return httpTool.validateConnection(host)
        .then(function(){
            done(new Error('Test should fail'));
        })
        .catch(function(err){
            expect(err.message).to.equal('Host %s is not alive'.format(host));
            done();
        });
    });
});
