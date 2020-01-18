

new Vue(
    {
        template:
        `
        <div>
            <h1>CONNECT 4: {{ msg }}</h1>
            <div class="grid-container">
                <div v-for="(value, key) in grid" v-on:click="on_click(key)" v-on:mouseleave="mouse_leave(key)" v-on:mouseover="mouse_hover(key)"> 
                    <div :class="highlight[key]" >{{ value }} </div> 
                </div>
            </div>
        </div>
        `,

        data:
        {
            msg: 'no message yet...',
            ws: new WebSocket('ws://localhost:6969'),
            grid: {},
            game_id: 0,
            player_id: 0,
            highlight: {}

        },

        methods:
        {
            create_msg(type, data)
            {
                let msg = {}
                msg['type'] = type
                msg['game_id'] = this.game_id
                msg['player_id'] = this.player_id
                msg['data'] = data
                return JSON.stringify(msg)
            },
            on_click(key)
            {
                this.ws.send(this.create_msg('on_click', key[2]))
            },
            highlight_col(data)
            {
                console.log(`highighting ${data[0]} with ${data[1]}`)
                for(var i = 0; i < 6; ++i)
                {
                    for(var j = 0; j < 7; ++j)
                    {
                        if(j == parseInt(data[0]))
                            this.highlight[`${i}x${j}`] = data[1]
                        else
                            this.highlight[`${i}x${j}`] = 'grid-item'
                    }
                }
                this.$forceUpdate()
            },
            mouse_hover(key)
            {
                this.ws.send(this.create_msg('mouse_hover', key[2]))
            },
            mouse_leave(key)
            {
                this.ws.send(this.create_msg('mouse_leave', key[2]))
            },
            async send_message()
            {
            }
        },

        created()
        {
            for(var i = 0; i < 6; ++i)
            {
                for(var j = 0; j < 7; ++j)
                    this.highlight[`${i}x${j}`] = 'grid-item'
            }
        },
        mounted()
        {
            this.ws.onmessage = event =>
            {
                let resp = JSON.parse(event.data)
                let type = resp['type']
                let data = resp['data']

                if(type === 'info')
                    this.msg = data
                else if(type === 'state_update')
                    this.grid = data
                else if(type === 'game_id')
                    this.game_id = data
                else if(type === 'player_id')
                    this.player_id = data
                else if(type === 'highlight')
                    this.highlight_col(data)
            }
        }
    }
).$mount('#root')
