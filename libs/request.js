import Request from 'request-promise'

/**
 * Param:
 * uri  - require
 * method - require
 * */
export function request(options){
  return new Promise((resolve,reject)=>{
    console.log('Request API : ',options.uri);
    Request(options, (err, data)=>{
      if(err){
        reject(err);
      }
      resolve(data.body);
    })
  })
}
