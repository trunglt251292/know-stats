import Request from 'request-promise'

/**
 * Param:
 * uri  - require
 * method - require
 * */
export function request(options){
  return new Promise((resolve,reject)=>{
    Request(options, (err, data)=>{
      if(err){
        reject(err);
      }
      if(data) {
        resolve(data.body);
      }
    })
  })
}
